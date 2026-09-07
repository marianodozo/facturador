import Link from "next/link";
import { prisma } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import { NOMBRE_CONDICION_IVA, formatearCuit } from "@/lib/fiscal";
import { Badge, BotonLink, Card, Input, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const sesion = await requerirSesion();
  const { q, estado } = await searchParams;

  const clientes = await prisma.cliente.findMany({
    where: {
      ...(estado === "inactivos" ? { activo: false } : estado === "todos" ? {} : { activo: true }),
      ...(q
        ? {
            OR: [
              { razonSocial: { contains: q, mode: "insensitive" as const } },
              { nombreFantasia: { contains: q, mode: "insensitive" as const } },
              { numeroDocumento: { contains: q } },
              { codigo: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { servicios: true, comprobantes: true } } },
    orderBy: { razonSocial: "asc" },
    take: 300,
  });

  return (
    <>
      <Titulo
        descripcion="Alta, baja y modificación de clientes con sus datos fiscales"
        acciones={
          puede(sesion.rol, "clientes:escribir") ? (
            <BotonLink href="/clientes/nuevo">Nuevo cliente</BotonLink>
          ) : null
        }
      >
        Clientes
      </Titulo>

      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por razón social, CUIT o código…"
            className="max-w-sm"
          />
          <select
            name="estado"
            defaultValue={estado ?? "activos"}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
          <button className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Filtrar
          </button>
        </form>

        {clientes.length === 0 ? (
          <Vacio
            mensaje="No hay clientes que coincidan con la búsqueda"
            accion={
              puede(sesion.rol, "clientes:escribir") ? (
                <BotonLink href="/clientes/nuevo">Cargar el primero</BotonLink>
              ) : null
            }
          />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Razón social</Th>
                <Th>Documento</Th>
                <Th>Condición IVA</Th>
                <Th className="text-right">Servicios</Th>
                <Th className="text-right">Comprobantes</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <Td className="tabular text-gray-500">{c.codigo}</Td>
                  <Td>
                    <Link href={`/clientes/${c.id}`} className="font-medium text-gray-900 hover:text-marca-700">
                      {c.razonSocial}
                    </Link>
                    {!c.activo && (
                      <span className="ml-2">
                        <Badge tono="gris">inactivo</Badge>
                      </span>
                    )}
                    {c.nombreFantasia && (
                      <p className="text-xs text-gray-500">{c.nombreFantasia}</p>
                    )}
                  </Td>
                  <Td className="tabular text-gray-600">
                    {c.tipoDocumento === "CUIT" ? formatearCuit(c.numeroDocumento) : c.numeroDocumento}
                  </Td>
                  <Td className="text-gray-600">{NOMBRE_CONDICION_IVA[c.condicionIVA]}</Td>
                  <Td className="tabular text-right">{c._count.servicios}</Td>
                  <Td className="tabular text-right">{c._count.comprobantes}</Td>
                  <Td className="text-right">
                    <Link href={`/clientes/${c.id}`} className="text-sm text-marca-600 hover:underline">
                      Ver
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}
