import { notFound } from "next/navigation";
import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import { formatearMoneda } from "@/lib/fiscal";
import { calcularAjuste, NOMBRE_PERIODICIDAD } from "@/lib/ajustes";
import { Alerta, Boton, Card, Input, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";
import { ServicioForm } from "../ServicioForm";
import { ajustarPrecioManual, aplicarAjusteServicio, eliminarServicio } from "../actions";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await requerirSesion();

  const servicio = await prisma.servicio.findUnique({
    where: { id },
    include: {
      cliente: true,
      indice: true,
      ajustes: { orderBy: { fecha: "desc" }, take: 20, include: { usuario: true } },
    },
  });
  if (!servicio) notFound();

  const [clientes, indices, previsualizacion] = await Promise.all([
    prisma.cliente.findMany({
      where: { OR: [{ activo: true }, { id: servicio.clienteId }] },
      select: { id: true, razonSocial: true, codigo: true },
      orderBy: { razonSocial: "asc" },
    }),
    prisma.indice.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: "asc" },
    }),
    calcularAjuste(servicio),
  ]);

  const puedeEditar = puede(sesion.rol, "servicios:escribir");

  const plano = {
    id: servicio.id,
    clienteId: servicio.clienteId,
    nombre: servicio.nombre,
    descripcion: servicio.descripcion,
    moneda: servicio.moneda,
    precioBase: servicio.precioBase.toString(),
    precioActual: formatearMoneda(dec(servicio.precioActual), servicio.moneda),
    alicuotaIVA: servicio.alicuotaIVA.toString(),
    cantidad: servicio.cantidad.toString(),
    unidad: servicio.unidad,
    periodicidadFacturacion: servicio.periodicidadFacturacion,
    diaFacturacion: servicio.diaFacturacion,
    facturaPorAdelantado: servicio.facturaPorAdelantado,
    fechaInicio: iso(servicio.fechaInicio),
    fechaFin: servicio.fechaFin ? iso(servicio.fechaFin) : null,
    proximaFacturacion: iso(servicio.proximaFacturacion),
    tipoAjuste: servicio.tipoAjuste,
    indiceId: servicio.indiceId,
    periodicidadAjuste: servicio.periodicidadAjuste,
    ajustePorcentaje: servicio.ajustePorcentaje?.toString() ?? null,
    periodoBaseIndice: servicio.periodoBaseIndice,
    topeAjustePorc: servicio.topeAjustePorc?.toString() ?? null,
    diasVencimiento: servicio.diasVencimiento,
    condicionPago: servicio.condicionPago,
    ordenCompra: servicio.ordenCompra,
    centroCosto: servicio.centroCosto,
    notas: servicio.notas,
    activo: servicio.activo,
  };

  return (
    <>
      <Titulo descripcion={`${servicio.cliente.razonSocial} · ${NOMBRE_PERIODICIDAD[servicio.periodicidadFacturacion]}`}>
        {servicio.nombre}
      </Titulo>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Precio vigente">
          <p className="tabular text-2xl font-semibold text-gray-900">
            {formatearMoneda(dec(servicio.precioActual), servicio.moneda)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Precio original {formatearMoneda(dec(servicio.precioBase), servicio.moneda)} · IVA{" "}
            {dec(servicio.alicuotaIVA)}%
          </p>
          {puedeEditar && (
            <form action={ajustarPrecioManual} className="mt-4 flex flex-wrap items-end gap-2">
              <input type="hidden" name="servicioId" value={servicio.id} />
              <Input
                name="precioNuevo"
                type="number"
                step="0.01"
                placeholder="Nuevo precio"
                className="max-w-[140px]"
                required
              />
              <Input name="motivo" placeholder="Motivo" className="max-w-[180px]" />
              <Boton variante="secundario" type="submit">
                Ajustar a mano
              </Boton>
            </form>
          )}
        </Card>

        <Card title="Próximo ajuste" className="lg:col-span-2">
          {servicio.tipoAjuste === "NINGUNO" ? (
            <p className="text-sm text-gray-500">Este servicio no tiene ajuste automático.</p>
          ) : (
            <>
              <p className="text-sm text-gray-700">{previsualizacion.motivo}</p>
              {previsualizacion.aplica ? (
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <div className="tabular text-sm">
                    <span className="text-gray-500 line-through">
                      {formatearMoneda(previsualizacion.precioAnterior, servicio.moneda)}
                    </span>
                    <span className="mx-2 text-gray-400">→</span>
                    <span className="font-semibold text-emerald-700">
                      {formatearMoneda(previsualizacion.precioNuevo, servicio.moneda)}
                    </span>
                    <span className="ml-2 text-gray-500">
                      (coef. {previsualizacion.coeficiente})
                    </span>
                  </div>
                  {puedeEditar && (
                    <form action={aplicarAjusteServicio}>
                      <input type="hidden" name="servicioId" value={servicio.id} />
                      <Boton type="submit">Aplicar ajuste</Boton>
                    </form>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  {servicio.proximoAjuste
                    ? `Programado para el ${servicio.proximoAjuste.toLocaleDateString("es-AR")}`
                    : "Sin fecha de próximo ajuste"}
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="mb-4">
        <Card title="Historial de ajustes">
          {servicio.ajustes.length === 0 ? (
            <Vacio mensaje="Todavía no se aplicaron ajustes" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Origen</Th>
                  <Th>Detalle</Th>
                  <Th className="text-right">Anterior</Th>
                  <Th className="text-right">Nuevo</Th>
                  <Th className="text-right">Var.</Th>
                </tr>
              </thead>
              <tbody>
                {servicio.ajustes.map((a) => {
                  const variacion = (dec(a.coeficiente) - 1) * 100;
                  return (
                    <tr key={a.id}>
                      <Td className="tabular text-gray-600">
                        {a.fecha.toLocaleDateString("es-AR")}
                      </Td>
                      <Td className="text-gray-600">{a.origen.replace("_", " ").toLowerCase()}</Td>
                      <Td className="text-gray-600">{a.motivo ?? "—"}</Td>
                      <Td className="tabular text-right">
                        {formatearMoneda(dec(a.precioAnterior), servicio.moneda)}
                      </Td>
                      <Td className="tabular text-right">
                        {formatearMoneda(dec(a.precioNuevo), servicio.moneda)}
                      </Td>
                      <Td
                        className={`tabular text-right ${variacion >= 0 ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {variacion >= 0 ? "+" : ""}
                        {variacion.toFixed(1)}%
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>

      {puedeEditar ? (
        <>
          <ServicioForm servicio={plano} clientes={clientes} indices={indices} />
          <form action={eliminarServicio} className="mt-6">
            <input type="hidden" name="servicioId" value={servicio.id} />
            <Alerta tono="aviso">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Si el servicio ya fue facturado no se puede borrar: se desactiva para conservar el
                  historial.
                </span>
                <Boton variante="peligro" type="submit">
                  Eliminar servicio
                </Boton>
              </div>
            </Alerta>
          </form>
        </>
      ) : null}
    </>
  );
}
