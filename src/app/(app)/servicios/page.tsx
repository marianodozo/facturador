import Link from "next/link";
import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import { formatearMoneda } from "@/lib/fiscal";
import { NOMBRE_PERIODICIDAD } from "@/lib/ajustes";
import { Badge, BotonLink, Card, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ServiciosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ajuste?: string; estado?: string }>;
}) {
  const sesion = await requerirSesion();
  const { q, ajuste, estado } = await searchParams;
  const hoy = new Date();

  const servicios = await prisma.servicio.findMany({
    where: {
      ...(estado === "todos" ? {} : { activo: true }),
      ...(ajuste === "pendiente"
        ? { tipoAjuste: { not: "NINGUNO" as const }, proximoAjuste: { lte: hoy } }
        : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" as const } },
              { cliente: { razonSocial: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    include: { cliente: true, indice: true },
    orderBy: [{ proximaFacturacion: "asc" }],
    take: 300,
  });

  const totalMensual = servicios.reduce((a, s) => {
    const meses =
      { MENSUAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, CUATRIMESTRAL: 4, SEMESTRAL: 6, ANUAL: 12, UNICA: 0 }[
        s.periodicidadFacturacion
      ] ?? 1;
    return meses ? a + (dec(s.precioActual) * dec(s.cantidad)) / meses : a;
  }, 0);

  return (
    <>
      <Titulo
        descripcion={`${servicios.length} servicios · equivalente mensual ${formatearMoneda(totalMensual)}`}
        acciones={
          puede(sesion.rol, "servicios:escribir") ? (
            <BotonLink href="/servicios/nuevo">Nuevo servicio</BotonLink>
          ) : null
        }
      >
        Servicios
      </Titulo>

      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por servicio o cliente…"
            className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="ajuste"
            defaultValue={ajuste ?? ""}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Todos los ajustes</option>
            <option value="pendiente">Con ajuste pendiente</option>
          </select>
          <select
            name="estado"
            defaultValue={estado ?? "activos"}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="activos">Activos</option>
            <option value="todos">Todos</option>
          </select>
          <button className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Filtrar
          </button>
        </form>

        {servicios.length === 0 ? (
          <Vacio mensaje="No hay servicios que coincidan" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Cliente / Servicio</Th>
                <Th>Facturación</Th>
                <Th>Próxima</Th>
                <Th>Ajuste</Th>
                <Th className="text-right">Precio vigente</Th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => {
                const ajustePendiente =
                  s.tipoAjuste !== "NINGUNO" && s.proximoAjuste && s.proximoAjuste <= hoy;
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <Td>
                      <Link href={`/servicios/${s.id}`} className="font-medium hover:text-marca-700">
                        {s.nombre}
                      </Link>
                      <p className="text-xs text-gray-500">{s.cliente.razonSocial}</p>
                    </Td>
                    <Td className="text-gray-600">
                      {NOMBRE_PERIODICIDAD[s.periodicidadFacturacion]}
                      <span className="text-gray-400"> · día {s.diaFacturacion}</span>
                    </Td>
                    <Td className="tabular text-gray-600">
                      {s.proximaFacturacion.toLocaleDateString("es-AR")}
                    </Td>
                    <Td>
                      {s.tipoAjuste === "NINGUNO" ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="text-gray-600">
                            {s.tipoAjuste === "INDICE"
                              ? s.indice?.codigo
                              : `${dec(s.ajustePorcentaje)}%`}
                          </span>
                          {ajustePendiente && <Badge tono="ambar">pendiente</Badge>}
                        </span>
                      )}
                    </Td>
                    <Td className="tabular text-right font-medium">
                      {formatearMoneda(dec(s.precioActual), s.moneda)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}
