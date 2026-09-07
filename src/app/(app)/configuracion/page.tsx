import { prisma } from "@/lib/db";
import { requerirPermiso } from "@/lib/auth";
import { Alerta, Boton, Campo, Card, Input, Tabla, Td, Th, Titulo } from "@/components/ui";
import { CertificadoForm, EmpresaForm } from "./Formularios";
import { crearPuntoVenta } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  await requerirPermiso("config:leer");

  const [empresa, puntos] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: 1 } }),
    prisma.puntoVenta.findMany({ orderBy: { numero: "asc" } }),
  ]);

  const plana = empresa
    ? {
        razonSocial: empresa.razonSocial,
        nombreFantasia: empresa.nombreFantasia,
        cuit: empresa.cuit,
        condicionIVA: empresa.condicionIVA,
        ingresosBrutos: empresa.ingresosBrutos,
        inicioActividades: empresa.inicioActividades?.toISOString().slice(0, 10) ?? null,
        domicilio: empresa.domicilio,
        localidad: empresa.localidad,
        provincia: empresa.provincia,
        codigoPostal: empresa.codigoPostal,
        telefono: empresa.telefono,
        email: empresa.email,
        web: empresa.web,
        arcaAmbiente: empresa.arcaAmbiente,
        ptoVtaDefault: empresa.ptoVtaDefault,
        conceptoDefault: empresa.conceptoDefault,
        diasVtoPagoDefault: empresa.diasVtoPagoDefault,
        leyendaPie: empresa.leyendaPie,
      }
    : null;

  return (
    <>
      <Titulo descripcion="Datos fiscales de la empresa y conexión con los web services de ARCA">
        Configuración
      </Titulo>

      {empresa?.arcaAmbiente === "PRODUCCION" && (
        <div className="mb-4">
          <Alerta tono="aviso">
            Estás apuntando a <strong>producción</strong>: cada comprobante que emitas es real y no
            se puede borrar, sólo corregir con una nota de crédito.
          </Alerta>
        </div>
      )}

      <div className="space-y-4">
        <EmpresaForm empresa={plana} />

        <CertificadoForm
          vencimiento={empresa?.arcaCertVencimiento?.toLocaleDateString("es-AR") ?? null}
          subject={empresa?.arcaCertSubject ?? null}
          ultimoError={empresa?.arcaUltimoError ?? null}
        />

        <Card
          title="Puntos de venta"
          descripcion="Deben estar dados de alta en ARCA como 'Web Services' para poder facturar"
        >
          <form action={crearPuntoVenta} className="mb-4 flex flex-wrap items-end gap-3">
            <Campo label="Número" className="w-28">
              <Input name="numero" type="number" min={1} required />
            </Campo>
            <Campo label="Descripción" className="min-w-[220px] flex-1">
              <Input name="descripcion" placeholder="Casa central" />
            </Campo>
            <Boton variante="secundario" type="submit">
              Agregar
            </Boton>
          </form>

          <Tabla>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Descripción</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {puntos.length === 0 ? (
                <tr>
                  <Td className="text-gray-500">Sin puntos de venta cargados</Td>
                  <Td />
                  <Td />
                </tr>
              ) : (
                puntos.map((p) => (
                  <tr key={p.id}>
                    <Td className="tabular">{String(p.numero).padStart(5, "0")}</Td>
                    <Td className="text-gray-600">{p.descripcion ?? "—"}</Td>
                    <Td className={p.activo ? "text-emerald-700" : "text-gray-400"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Tabla>
        </Card>

        <Card title="Cómo obtener el certificado de ARCA">
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-gray-600">
            <li>
              Generá la clave privada y el CSR:{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">
                openssl req -new -newkey rsa:2048 -nodes -keyout privada.key -out pedido.csr -subj
                &quot;/C=AR/O=TU RAZON SOCIAL/CN=facturador/serialNumber=CUIT TUCUIT&quot;
              </code>
            </li>
            <li>
              En el portal de ARCA, entrá a <em>Administración de Certificados Digitales</em> y subí
              el CSR para obtener el <code>.crt</code>.
            </li>
            <li>
              En <em>Administrador de Relaciones de Clave Fiscal</em>, asociá ese certificado (o
              alias) al servicio <strong>Facturación Electrónica (wsfe)</strong>.
            </li>
            <li>
              Dá de alta el punto de venta como <em>Factura Electrónica – Web Services</em> en{" "}
              <em>Regímenes de Facturación y Registración</em>.
            </li>
            <li>Pegá acá el contenido del .crt y de la clave privada, y probá la conexión.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
