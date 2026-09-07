import { prisma } from "@/lib/db";
import { requerirPermiso } from "@/lib/auth";
import { Alerta, Titulo } from "@/components/ui";
import { ServicioForm } from "../ServicioForm";

export const dynamic = "force-dynamic";

export default async function NuevoServicioPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  await requerirPermiso("servicios:escribir");
  const { cliente } = await searchParams;

  const [clientes, indices] = await Promise.all([
    prisma.cliente.findMany({
      where: { activo: true },
      select: { id: true, razonSocial: true, codigo: true },
      orderBy: { razonSocial: "asc" },
    }),
    prisma.indice.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: "asc" },
    }),
  ]);

  return (
    <>
      <Titulo descripcion="Definí precio, periodicidad de facturación y cómo se ajusta">
        Nuevo servicio
      </Titulo>
      {clientes.length === 0 && (
        <div className="mb-4">
          <Alerta tono="aviso">Primero necesitás dar de alta al menos un cliente activo.</Alerta>
        </div>
      )}
      <ServicioForm clientes={clientes} indices={indices} clienteInicial={cliente} />
    </>
  );
}
