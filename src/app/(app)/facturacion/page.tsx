import Link from "next/link";
import { prisma, dec } from "@/lib/db";
import { requerirPermiso } from "@/lib/auth";
import { formatearMoneda } from "@/lib/fiscal";
import { NOMBRE_PERIODICIDAD, periodoDe } from "@/lib/ajustes";
import { Card, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";
import { EstadoCorridaBadge } from "@/components/estados";
import { NuevaCorrida } from "./NuevaCorrida";

export const dynamic = "force-dynamic";

export default async function FacturacionPage() {
  await requerirPermiso("comprobantes:escribir");

  const hoy = new Date();
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

  const [corridas, porFacturar] = await Promise.all([
    prisma.corridaFacturacion.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        creadoPor: { select: { nombre: true } },
        comprobantes: { select: { estado: true, importeTotal: true } },
      },
    }),
    prisma.servicio.findMany({
      where: {
        activo: true,
        cliente: { activo: true },
        proximaFacturacion: { lte: finMes },
      },
      include: { cliente: true },
      orderBy: { proximaFacturacion: "asc" },
      take: 100,
    }),
  ]);

  const totalPorFacturar = porFacturar.reduce(
    (a, s) => a + dec(s.precioActual) * dec(s.cantidad),
    0,
  );

  return (
    <>
      <Titulo descripcion="Generá los borradores, controlalos y recién ahí emitilos a ARCA">
        Facturación
      </Titulo>

      <div className="mb-4">
        <NuevaCorrida periodo={periodoDe(hoy)} hoy={hoy.toISOString().slice(0, 10)} />
      </div>

      <div className="mb-4">
        <Card
          title="Servicios a facturar en este período"
          descripcion={`${porFacturar.length} servicios · ${formatearMoneda(totalPorFacturar)} sin IVA`}
        >
          {porFacturar.length === 0 ? (
            <Vacio mensaje="No hay servicios con facturación pendiente este mes" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Servicio</Th>
                  <Th>Periodicidad</Th>
                  <Th>Vence</Th>
                  <Th className="text-right">Importe</Th>
                </tr>
              </thead>
              <tbody>
                {porFacturar.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <Td>
                      <Link href={`/clientes/${s.clienteId}`} className="hover:text-marca-700">
                        {s.cliente.razonSocial}
                      </Link>
                    </Td>
                    <Td className="text-gray-600">{s.nombre}</Td>
                    <Td className="text-gray-600">
                      {NOMBRE_PERIODICIDAD[s.periodicidadFacturacion]}
                    </Td>
                    <Td className="tabular text-gray-600">
                      {s.proximaFacturacion.toLocaleDateString("es-AR")}
                    </Td>
                    <Td className="tabular text-right">
                      {formatearMoneda(dec(s.precioActual) * dec(s.cantidad), s.moneda)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>

      <Card title="Corridas anteriores">
        {corridas.length === 0 ? (
          <Vacio mensaje="Todavía no generaste ninguna corrida" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Período</Th>
                <Th>Descripción</Th>
                <Th>Estado</Th>
                <Th className="text-right">Comprobantes</Th>
                <Th className="text-right">Total</Th>
                <Th>Generó</Th>
              </tr>
            </thead>
            <tbody>
              {corridas.map((c) => {
                const total = c.comprobantes.reduce((a, x) => a + dec(x.importeTotal), 0);
                const autorizados = c.comprobantes.filter((x) => x.estado === "AUTORIZADO").length;
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <Td>
                      <Link
                        href={`/facturacion/${c.id}`}
                        className="tabular font-medium hover:text-marca-700"
                      >
                        {c.periodo}
                      </Link>
                    </Td>
                    <Td className="text-gray-600">{c.descripcion ?? "—"}</Td>
                    <Td>
                      <EstadoCorridaBadge estado={c.estado} />
                    </Td>
                    <Td className="tabular text-right">
                      {autorizados}/{c.comprobantes.length}
                    </Td>
                    <Td className="tabular text-right">{formatearMoneda(total)}</Td>
                    <Td className="text-gray-500">{c.creadoPor?.nombre ?? "—"}</Td>
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
