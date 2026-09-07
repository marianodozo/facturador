import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import {
  NOMBRE_COMPROBANTE,
  NOMBRE_CONDICION_IVA,
  discriminaIVA,
  formatearCuit,
  formatearMoneda,
  formatearNumero,
} from "@/lib/fiscal";
import type { Validacion } from "@/lib/facturacion";
import { Alerta, Boton, Campo, Card, Input, Tabla, Td, Th, Titulo } from "@/components/ui";
import { EstadoBadge } from "@/components/estados";
import { emitirUno, aprobarUno } from "../../facturacion/actions";
import { crearNotaCreditoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await requerirSesion();

  const c = await prisma.comprobante.findUnique({
    where: { id },
    include: {
      cliente: true,
      items: { orderBy: { orden: "asc" } },
      lineasIVA: true,
      puntoVenta: true,
      comprobanteAsociado: { include: { puntoVenta: true } },
      comprobantesHijos: { include: { puntoVenta: true } },
      createdBy: { select: { nombre: true } },
      autorizadoBy: { select: { nombre: true } },
      corrida: true,
    },
  });
  if (!c) notFound();

  const validaciones = (c.validaciones as Validacion[] | null) ?? [];
  const errores = validaciones.filter((v) => v.nivel === "ERROR");
  const avisos = validaciones.filter((v) => v.nivel === "ADVERTENCIA");
  const discrimina = discriminaIVA(c.tipo);
  const observaciones = (c.observaciones as { codigo: string; mensaje: string }[] | null) ?? [];
  const erroresArca = (c.errores as { mensaje: string }[] | null) ?? [];

  const puedeEmitir = puede(sesion.rol, "comprobantes:emitir");
  const puedeEscribir = puede(sesion.rol, "comprobantes:escribir");

  return (
    <>
      <Titulo
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={c.estado} />
            <span className="tabular">{formatearNumero(c.puntoVenta.numero, c.numero)}</span>
            <span>· emitido el {c.fechaEmision.toLocaleDateString("es-AR")}</span>
            {c.corrida && (
              <Link href={`/facturacion/${c.corrida.id}`} className="text-marca-600 hover:underline">
                · corrida {c.corrida.periodo}
              </Link>
            )}
          </span>
        }
        acciones={
          <a
            href={`/api/comprobantes/${c.id}/pdf`}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Descargar PDF
          </a>
        }
      >
        {NOMBRE_COMPROBANTE[c.tipo]}
      </Titulo>

      {errores.length > 0 && (
        <div className="mb-4">
          <Alerta tono="error">
            <p className="mb-1 font-medium">El control previo encontró errores:</p>
            <ul className="list-inside list-disc space-y-0.5">
              {errores.map((v, i) => (
                <li key={i}>{v.mensaje}</li>
              ))}
            </ul>
          </Alerta>
        </div>
      )}
      {avisos.length > 0 && (
        <div className="mb-4">
          <Alerta tono="aviso">
            <ul className="list-inside list-disc space-y-0.5">
              {avisos.map((v, i) => (
                <li key={i}>{v.mensaje}</li>
              ))}
            </ul>
          </Alerta>
        </div>
      )}
      {erroresArca.length > 0 && (
        <div className="mb-4">
          <Alerta tono="error">
            ARCA rechazó el envío: {erroresArca.map((e) => e.mensaje).join(" · ")}
          </Alerta>
        </div>
      )}

      {c.estado !== "AUTORIZADO" && (puedeEscribir || puedeEmitir) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {puedeEscribir && c.estado !== "APROBADO" && errores.length === 0 && (
            <form action={aprobarUno}>
              <input type="hidden" name="comprobanteId" value={c.id} />
              <Boton variante="secundario" type="submit">
                Aprobar
              </Boton>
            </form>
          )}
          {puedeEmitir && errores.length === 0 && (
            <form action={emitirUno}>
              <input type="hidden" name="comprobanteId" value={c.id} />
              <Boton type="submit">Emitir a ARCA</Boton>
            </form>
          )}
        </div>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Receptor" className="lg:col-span-2">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">Razón social</dt>
              <dd className="font-medium">
                <Link href={`/clientes/${c.clienteId}`} className="hover:text-marca-700">
                  {c.cliRazonSocial}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{c.cliTipoDoc}</dt>
              <dd className="tabular">
                {c.cliTipoDoc === "CUIT" ? formatearCuit(c.cliNroDoc) : c.cliNroDoc}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Condición frente al IVA</dt>
              <dd>{NOMBRE_CONDICION_IVA[c.cliCondicionIVA]}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Domicilio</dt>
              <dd>{c.cliDomicilio || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Período de servicio</dt>
              <dd className="tabular">
                {c.servicioDesde && c.servicioHasta
                  ? `${c.servicioDesde.toLocaleDateString("es-AR")} al ${c.servicioHasta.toLocaleDateString("es-AR")}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Vencimiento del pago</dt>
              <dd className="tabular">{c.fechaVtoPago?.toLocaleDateString("es-AR") ?? "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Autorización de ARCA">
          {c.cae ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">CAE</dt>
                <dd className="tabular font-medium">{c.cae}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Vencimiento del CAE</dt>
                <dd className="tabular">{c.caeVencimiento?.toLocaleDateString("es-AR")}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Autorizado por</dt>
                <dd>
                  {c.autorizadoBy?.nombre ?? "—"} ·{" "}
                  {c.autorizadoAt?.toLocaleString("es-AR") ?? ""}
                </dd>
              </div>
              {observaciones.length > 0 && (
                <div>
                  <dt className="text-xs text-gray-500">Observaciones</dt>
                  <dd className="text-xs text-amber-700">
                    {observaciones.map((o) => `[${o.codigo}] ${o.mensaje}`).join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-500">
              Todavía no fue autorizado. El PDF sale marcado como borrador sin validez fiscal.
            </p>
          )}
        </Card>
      </div>

      <div className="mb-4">
        <Card title="Detalle">
          <Tabla>
            <thead>
              <tr>
                <Th>Descripción</Th>
                <Th className="text-right">Cant.</Th>
                <Th className="text-right">P. unitario</Th>
                {discrimina && <Th className="text-right">IVA</Th>}
                <Th className="text-right">Subtotal</Th>
              </tr>
            </thead>
            <tbody>
              {c.items.map((i) => (
                <tr key={i.id}>
                  <Td>{i.descripcion}</Td>
                  <Td className="tabular text-right">{dec(i.cantidad)}</Td>
                  <Td className="tabular text-right">
                    {formatearMoneda(dec(i.precioUnitario), c.moneda)}
                  </Td>
                  {discrimina && (
                    <Td className="tabular text-right">{dec(i.alicuotaIVA)}%</Td>
                  )}
                  <Td className="tabular text-right">
                    {formatearMoneda(
                      discrimina ? dec(i.importeNeto) : dec(i.importeTotal),
                      c.moneda,
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>

          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              {discrimina && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Neto gravado</dt>
                    <dd className="tabular">{formatearMoneda(dec(c.importeNeto), c.moneda)}</dd>
                  </div>
                  {dec(c.importeExento) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Exento</dt>
                      <dd className="tabular">{formatearMoneda(dec(c.importeExento), c.moneda)}</dd>
                    </div>
                  )}
                  {c.lineasIVA
                    .filter((l) => dec(l.alicuota) > 0)
                    .map((l) => (
                      <div key={l.id} className="flex justify-between">
                        <dt className="text-gray-500">IVA {dec(l.alicuota)}%</dt>
                        <dd className="tabular">{formatearMoneda(dec(l.importe), c.moneda)}</dd>
                      </div>
                    ))}
                </>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatearMoneda(dec(c.importeTotal), c.moneda)}</dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>

      {(c.comprobanteAsociado || c.comprobantesHijos.length > 0) && (
        <div className="mb-4">
          <Card title="Comprobantes relacionados">
            <ul className="space-y-2 text-sm">
              {c.comprobanteAsociado && (
                <li>
                  Corrige a{" "}
                  <Link
                    href={`/comprobantes/${c.comprobanteAsociado.id}`}
                    className="text-marca-600 hover:underline"
                  >
                    {NOMBRE_COMPROBANTE[c.comprobanteAsociado.tipo]}{" "}
                    {formatearNumero(
                      c.comprobanteAsociado.puntoVenta.numero,
                      c.comprobanteAsociado.numero,
                    )}
                  </Link>
                  {c.motivoNota && <span className="text-gray-500"> — {c.motivoNota}</span>}
                </li>
              )}
              {c.comprobantesHijos.map((h) => (
                <li key={h.id}>
                  Corregido por{" "}
                  <Link href={`/comprobantes/${h.id}`} className="text-marca-600 hover:underline">
                    {NOMBRE_COMPROBANTE[h.tipo]}{" "}
                    {formatearNumero(h.puntoVenta.numero, h.numero)}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {c.estado === "AUTORIZADO" && !c.tipo.startsWith("NOTA_") && puedeEscribir && (
        <Card
          title="Emitir nota de crédito"
          descripcion="Un comprobante autorizado no se borra: se corrige con una nota de crédito"
        >
          <form action={crearNotaCreditoAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="comprobanteId" value={c.id} />
            <Campo label="Motivo" className="min-w-[240px] flex-1">
              <Input name="motivo" placeholder="Anulación por error de facturación" required />
            </Campo>
            <Campo label="Importe parcial" ayuda="Vacío = nota de crédito total">
              <Input name="importeParcial" type="number" step="0.01" className="max-w-[160px]" />
            </Campo>
            <Boton variante="secundario" type="submit">
              Generar nota de crédito
            </Boton>
          </form>
        </Card>
      )}
    </>
  );
}
