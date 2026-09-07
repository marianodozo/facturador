import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import { NOMBRE_COMPROBANTE, formatearMoneda, formatearNumero } from "@/lib/fiscal";
import type { Validacion } from "@/lib/facturacion";
import { Alerta, Boton, Card, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";
import { EstadoBadge, EstadoCorridaBadge } from "@/components/estados";
import {
  aprobarTodo,
  cancelarCorrida,
  descartarComprobante,
  emitirCorridaAction,
  emitirUno,
  revisarTodo,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function CorridaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await requerirSesion();

  const corrida = await prisma.corridaFacturacion.findUnique({
    where: { id },
    include: {
      creadoPor: { select: { nombre: true } },
      comprobantes: {
        orderBy: { cliRazonSocial: "asc" },
        include: { puntoVenta: true, items: true, cliente: true },
      },
    },
  });
  if (!corrida) notFound();

  const puedeEmitir = puede(sesion.rol, "comprobantes:emitir");
  const puedeEditar = puede(sesion.rol, "comprobantes:escribir");

  const conValidaciones = corrida.comprobantes.map((c) => ({
    ...c,
    validaciones: (c.validaciones as Validacion[] | null) ?? [],
  }));

  const conError = conValidaciones.filter((c) =>
    c.validaciones.some((v) => v.nivel === "ERROR"),
  ).length;
  const conAdvertencia = conValidaciones.filter((c) =>
    c.validaciones.some((v) => v.nivel === "ADVERTENCIA"),
  ).length;
  const listos = conValidaciones.filter((c) => c.estado === "APROBADO").length;
  const autorizados = conValidaciones.filter((c) => c.estado === "AUTORIZADO").length;
  const total = conValidaciones.reduce((a, c) => a + dec(c.importeTotal), 0);

  return (
    <>
      <Titulo
        descripcion={
          <span className="flex items-center gap-2">
            <EstadoCorridaBadge estado={corrida.estado} />
            <span>
              {corrida.descripcion ?? "Corrida de facturación"} · generada por{" "}
              {corrida.creadoPor?.nombre ?? "—"} ·{" "}
              {corrida.fechaEmision?.toLocaleDateString("es-AR")}
            </span>
          </span>
        }
      >
        Control previo — período {corrida.periodo}
      </Titulo>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { etiqueta: "Comprobantes", valor: String(conValidaciones.length) },
          { etiqueta: "Importe total", valor: formatearMoneda(total) },
          { etiqueta: "Con errores", valor: String(conError), alerta: conError > 0 },
          { etiqueta: "Con advertencias", valor: String(conAdvertencia) },
          { etiqueta: "Autorizados", valor: `${autorizados}/${conValidaciones.length}` },
        ].map((m) => (
          <div key={m.etiqueta} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{m.etiqueta}</p>
            <p
              className={`tabular mt-1 text-lg font-semibold ${
                m.alerta ? "text-red-700" : "text-gray-900"
              }`}
            >
              {m.valor}
            </p>
          </div>
        ))}
      </div>

      {conError > 0 && (
        <div className="mb-4">
          <Alerta tono="error">
            Hay {conError} comprobantes con errores que ARCA rechazaría. Corregí los datos del
            cliente o del servicio y volvé a revisar antes de emitir.
          </Alerta>
        </div>
      )}

      {puedeEditar && corrida.estado !== "CANCELADA" && (
        <div className="mb-4 flex flex-wrap gap-2">
          <form action={revisarTodo}>
            <input type="hidden" name="corridaId" value={corrida.id} />
            <Boton variante="secundario" type="submit">
              Volver a revisar todo
            </Boton>
          </form>
          <form action={aprobarTodo}>
            <input type="hidden" name="corridaId" value={corrida.id} />
            <Boton variante="secundario" type="submit">
              Aprobar los que pasaron el control
            </Boton>
          </form>
          {puedeEmitir && (
            <form action={emitirCorridaAction}>
              <input type="hidden" name="corridaId" value={corrida.id} />
              <Boton type="submit" disabled={listos === 0}>
                Emitir a ARCA ({listos} listos)
              </Boton>
            </form>
          )}
          {corrida.estado !== "EMITIDA" && autorizados === 0 && (
            <form action={cancelarCorrida} className="ml-auto">
              <input type="hidden" name="corridaId" value={corrida.id} />
              <Boton variante="fantasma" type="submit">
                Cancelar corrida
              </Boton>
            </form>
          )}
        </div>
      )}

      {conValidaciones.length === 0 ? (
        <Card>
          <Vacio mensaje="La corrida no tiene comprobantes" />
        </Card>
      ) : (
        <div className="space-y-3">
          {conValidaciones.map((c) => {
            const errores = c.validaciones.filter((v) => v.nivel === "ERROR");
            const avisos = c.validaciones.filter((v) => v.nivel === "ADVERTENCIA");
            return (
              <div
                key={c.id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  errores.length ? "border-red-200" : "border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/comprobantes/${c.id}`}
                        className="font-medium text-gray-900 hover:text-marca-700"
                      >
                        {c.cliRazonSocial}
                      </Link>
                      <EstadoBadge estado={c.estado} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {NOMBRE_COMPROBANTE[c.tipo]} {formatearNumero(c.puntoVenta.numero, c.numero)} ·{" "}
                      {c.items.length} ítems ·{" "}
                      {c.servicioDesde && c.servicioHasta
                        ? `período ${c.servicioDesde.toLocaleDateString("es-AR")} al ${c.servicioHasta.toLocaleDateString("es-AR")}`
                        : "sin período"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-lg font-semibold text-gray-900">
                      {formatearMoneda(dec(c.importeTotal), c.moneda)}
                    </p>
                    <p className="tabular text-[11px] text-gray-500">
                      neto {formatearMoneda(dec(c.importeNeto), c.moneda)} · IVA{" "}
                      {formatearMoneda(dec(c.importeIVA), c.moneda)}
                    </p>
                  </div>
                </div>

                {(errores.length > 0 || avisos.length > 0) && (
                  <ul className="mt-3 space-y-1 text-xs">
                    {errores.map((v, i) => (
                      <li key={`e${i}`} className="flex gap-2 text-red-700">
                        <span aria-hidden>●</span>
                        <span>{v.mensaje}</span>
                      </li>
                    ))}
                    {avisos.map((v, i) => (
                      <li key={`a${i}`} className="flex gap-2 text-amber-700">
                        <span aria-hidden>●</span>
                        <span>{v.mensaje}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {c.cae && (
                  <p className="tabular mt-3 text-xs text-emerald-700">
                    CAE {c.cae} · vence {c.caeVencimiento?.toLocaleDateString("es-AR")}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/comprobantes/${c.id}`}
                    className="text-xs font-medium text-marca-600 hover:underline"
                  >
                    Ver detalle
                  </Link>
                  <Link
                    href={`/clientes/${c.clienteId}`}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Ver cliente
                  </Link>
                  {puedeEmitir && c.estado !== "AUTORIZADO" && errores.length === 0 && (
                    <form action={emitirUno} className="ml-auto">
                      <input type="hidden" name="comprobanteId" value={c.id} />
                      <Boton variante="secundario" type="submit" className="px-2 py-1 text-xs">
                        Emitir sólo este
                      </Boton>
                    </form>
                  )}
                  {puedeEditar && c.estado !== "AUTORIZADO" && (
                    <form action={descartarComprobante}>
                      <input type="hidden" name="comprobanteId" value={c.id} />
                      <Boton variante="fantasma" type="submit" className="px-2 py-1 text-xs">
                        Descartar
                      </Boton>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Card title="Resumen por tipo de comprobante">
          <Tabla>
            <thead>
              <tr>
                <Th>Tipo</Th>
                <Th className="text-right">Cantidad</Th>
                <Th className="text-right">Neto</Th>
                <Th className="text-right">IVA</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(
                conValidaciones.reduce<Record<string, { n: number; neto: number; iva: number; total: number }>>(
                  (acc, c) => {
                    const k = c.tipo;
                    acc[k] ??= { n: 0, neto: 0, iva: 0, total: 0 };
                    acc[k].n += 1;
                    acc[k].neto += dec(c.importeNeto);
                    acc[k].iva += dec(c.importeIVA);
                    acc[k].total += dec(c.importeTotal);
                    return acc;
                  },
                  {},
                ),
              ).map(([tipo, v]) => (
                <tr key={tipo}>
                  <Td>{NOMBRE_COMPROBANTE[tipo as keyof typeof NOMBRE_COMPROBANTE]}</Td>
                  <Td className="tabular text-right">{v.n}</Td>
                  <Td className="tabular text-right">{formatearMoneda(v.neto)}</Td>
                  <Td className="tabular text-right">{formatearMoneda(v.iva)}</Td>
                  <Td className="tabular text-right font-medium">{formatearMoneda(v.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Card>
      </div>
    </>
  );
}
