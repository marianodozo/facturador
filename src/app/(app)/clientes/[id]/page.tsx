import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import {
  NOMBRE_COMPROBANTE,
  determinarTipoComprobante,
  formatearMoneda,
  formatearNumero,
} from "@/lib/fiscal";
import { NOMBRE_PERIODICIDAD } from "@/lib/ajustes";
import { Alerta, Badge, BotonLink, Card, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";
import { ClienteForm } from "../ClienteForm";
import { EstadoBadge } from "@/components/estados";

export const dynamic = "force-dynamic";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await requerirSesion();

  const [cliente, empresa] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id },
      include: {
        servicios: { orderBy: { nombre: "asc" }, include: { indice: true } },
        comprobantes: {
          orderBy: { fechaEmision: "desc" },
          take: 20,
          include: { puntoVenta: true },
        },
      },
    }),
    prisma.empresa.findUnique({ where: { id: 1 } }),
  ]);

  if (!cliente) notFound();

  const tipoQueRecibe = empresa
    ? determinarTipoComprobante(empresa.condicionIVA, cliente.condicionIVA)
    : null;

  const puedeEditar = puede(sesion.rol, "clientes:escribir");

  return (
    <>
      <Titulo
        descripcion={`Código ${cliente.codigo}`}
        acciones={
          puedeEditar ? (
            <BotonLink href={`/servicios/nuevo?cliente=${cliente.id}`} variante="secundario">
              Agregar servicio
            </BotonLink>
          ) : null
        }
      >
        {cliente.razonSocial}
      </Titulo>

      {tipoQueRecibe && (
        <div className="mb-4">
          <Alerta tono="info">
            A este cliente le corresponde <strong>{NOMBRE_COMPROBANTE[tipoQueRecibe]}</strong>, según
            la condición frente al IVA de la empresa y la del cliente.
          </Alerta>
        </div>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Servicios contratados"
          descripcion={`${cliente.servicios.filter((s) => s.activo).length} activos`}
        >
          {cliente.servicios.length === 0 ? (
            <Vacio
              mensaje="Todavía no tiene servicios"
              accion={
                puedeEditar ? (
                  <BotonLink href={`/servicios/nuevo?cliente=${cliente.id}`}>Agregar servicio</BotonLink>
                ) : null
              }
            />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Servicio</Th>
                  <Th>Periodicidad</Th>
                  <Th>Ajuste</Th>
                  <Th className="text-right">Precio</Th>
                </tr>
              </thead>
              <tbody>
                {cliente.servicios.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <Td>
                      <Link href={`/servicios/${s.id}`} className="font-medium hover:text-marca-700">
                        {s.nombre}
                      </Link>
                      {!s.activo && (
                        <span className="ml-2">
                          <Badge tono="gris">inactivo</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-gray-600">
                      {NOMBRE_PERIODICIDAD[s.periodicidadFacturacion]}
                    </Td>
                    <Td className="text-gray-600">
                      {s.tipoAjuste === "NINGUNO"
                        ? "—"
                        : s.tipoAjuste === "INDICE"
                          ? `${s.indice?.codigo ?? "índice"} · ${
                              s.periodicidadAjuste ? NOMBRE_PERIODICIDAD[s.periodicidadAjuste] : ""
                            }`
                          : `${dec(s.ajustePorcentaje)}% ${
                              s.periodicidadAjuste ? NOMBRE_PERIODICIDAD[s.periodicidadAjuste] : ""
                            }`}
                    </Td>
                    <Td className="tabular text-right">
                      {formatearMoneda(dec(s.precioActual), s.moneda)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>

        <Card title="Últimos comprobantes">
          {cliente.comprobantes.length === 0 ? (
            <Vacio mensaje="Sin comprobantes emitidos" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Comprobante</Th>
                  <Th>Fecha</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {cliente.comprobantes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <Td>
                      <Link href={`/comprobantes/${c.id}`} className="hover:text-marca-700">
                        {NOMBRE_COMPROBANTE[c.tipo]}{" "}
                        <span className="tabular text-gray-500">
                          {formatearNumero(c.puntoVenta.numero, c.numero)}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-gray-600">
                      {c.fechaEmision.toLocaleDateString("es-AR")}
                    </Td>
                    <Td>
                      <EstadoBadge estado={c.estado} />
                    </Td>
                    <Td className="tabular text-right">
                      {formatearMoneda(dec(c.importeTotal), c.moneda)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>

      {puedeEditar ? (
        <ClienteForm cliente={cliente} />
      ) : (
        <Card title="Datos del cliente">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">Documento</dt>
              <dd>
                {cliente.tipoDocumento} {cliente.numeroDocumento}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Email de facturación</dt>
              <dd>{cliente.emailFacturacion ?? cliente.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Domicilio</dt>
              <dd>{cliente.domicilio ?? "—"}</dd>
            </div>
          </dl>
        </Card>
      )}
    </>
  );
}
