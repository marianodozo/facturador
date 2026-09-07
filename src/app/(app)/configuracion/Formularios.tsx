"use client";

import { useActionState, useState, useTransition } from "react";
import {
  guardarCertificado,
  guardarEmpresa,
  probarConexion,
  sincronizarPuntosVenta,
  type EstadoForm,
} from "./actions";
import { NOMBRE_CONDICION_IVA } from "@/lib/fiscal";
import { Alerta, Boton, Campo, Card, Input, Select, TextArea } from "@/components/ui";

type EmpresaPlana = {
  razonSocial: string;
  nombreFantasia: string | null;
  cuit: string;
  condicionIVA: string;
  ingresosBrutos: string | null;
  inicioActividades: string | null;
  domicilio: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  arcaAmbiente: string;
  ptoVtaDefault: number;
  conceptoDefault: number;
  diasVtoPagoDefault: number;
  leyendaPie: string | null;
} | null;

export function EmpresaForm({ empresa }: { empresa: EmpresaPlana }) {
  const [estado, accion, pendiente] = useActionState(guardarEmpresa, {} as EstadoForm);

  return (
    <form action={accion} className="space-y-4">
      {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}
      {estado?.ok && <Alerta tono="exito">{estado.ok}</Alerta>}

      <Card title="Datos de la empresa facturante">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Razón social" className="lg:col-span-2">
            <Input name="razonSocial" defaultValue={empresa?.razonSocial ?? ""} required />
          </Campo>
          <Campo label="Nombre de fantasía">
            <Input name="nombreFantasia" defaultValue={empresa?.nombreFantasia ?? ""} />
          </Campo>
          <Campo label="CUIT">
            <Input name="cuit" defaultValue={empresa?.cuit ?? ""} required />
          </Campo>
          <Campo label="Condición frente al IVA" ayuda="Define si emitís A/B o C">
            <Select
              name="condicionIVA"
              defaultValue={empresa?.condicionIVA ?? "RESPONSABLE_INSCRIPTO"}
            >
              {Object.entries(NOMBRE_CONDICION_IVA)
                .filter(([v]) => ["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "EXENTO"].includes(v))
                .map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
            </Select>
          </Campo>
          <Campo label="Ingresos Brutos">
            <Input name="ingresosBrutos" defaultValue={empresa?.ingresosBrutos ?? ""} />
          </Campo>
          <Campo label="Inicio de actividades">
            <Input
              name="inicioActividades"
              type="date"
              defaultValue={empresa?.inicioActividades ?? ""}
            />
          </Campo>
          <Campo label="Domicilio" className="lg:col-span-2">
            <Input name="domicilio" defaultValue={empresa?.domicilio ?? ""} />
          </Campo>
          <Campo label="Localidad">
            <Input name="localidad" defaultValue={empresa?.localidad ?? ""} />
          </Campo>
          <Campo label="Provincia">
            <Input name="provincia" defaultValue={empresa?.provincia ?? ""} />
          </Campo>
          <Campo label="Código postal">
            <Input name="codigoPostal" defaultValue={empresa?.codigoPostal ?? ""} />
          </Campo>
          <Campo label="Teléfono">
            <Input name="telefono" defaultValue={empresa?.telefono ?? ""} />
          </Campo>
          <Campo label="Email">
            <Input name="email" type="email" defaultValue={empresa?.email ?? ""} />
          </Campo>
          <Campo label="Sitio web">
            <Input name="web" defaultValue={empresa?.web ?? ""} />
          </Campo>
        </div>
      </Card>

      <Card title="Preferencias de emisión">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Ambiente de ARCA" ayuda="Homologación es el entorno de prueba">
            <Select name="arcaAmbiente" defaultValue={empresa?.arcaAmbiente ?? "PRODUCCION"}>
              <option value="PRODUCCION">Producción</option>
              <option value="HOMOLOGACION">Homologación</option>
            </Select>
          </Campo>
          <Campo label="Punto de venta por defecto">
            <Input name="ptoVtaDefault" type="number" min={1} defaultValue={empresa?.ptoVtaDefault ?? 1} />
          </Campo>
          <Campo label="Concepto">
            <Select name="conceptoDefault" defaultValue={String(empresa?.conceptoDefault ?? 2)}>
              <option value="1">Productos</option>
              <option value="2">Servicios</option>
              <option value="3">Productos y servicios</option>
            </Select>
          </Campo>
          <Campo label="Días de vencimiento por defecto">
            <Input
              name="diasVtoPagoDefault"
              type="number"
              min={0}
              defaultValue={empresa?.diasVtoPagoDefault ?? 0}
            />
          </Campo>
          <Campo label="Leyenda al pie del PDF" className="sm:col-span-2 lg:col-span-4">
            <Input name="leyendaPie" defaultValue={empresa?.leyendaPie ?? ""} />
          </Campo>
        </div>
      </Card>

      <Boton type="submit" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar configuración"}
      </Boton>
    </form>
  );
}

export function CertificadoForm({
  vencimiento,
  subject,
  ultimoError,
}: {
  vencimiento: string | null;
  subject: string | null;
  ultimoError: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(guardarCertificado, {} as EstadoForm);
  const [prueba, setPrueba] = useState<EstadoForm | null>(null);
  const [enCurso, startTransition] = useTransition();

  return (
    <Card
      title="Conexión con ARCA"
      descripcion="Certificado X.509 y clave privada del web service de facturación electrónica (WSFEv1)"
    >
      {subject && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <p className="font-medium text-gray-800">Certificado cargado</p>
          <p className="mt-0.5 break-all">{subject}</p>
          {vencimiento && <p className="mt-0.5">Vence el {vencimiento}</p>}
        </div>
      )}
      {ultimoError && (
        <div className="mb-4">
          <Alerta tono="aviso">Último error con ARCA: {ultimoError}</Alerta>
        </div>
      )}

      <form action={accion} className="space-y-4">
        {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}
        {estado?.ok && <Alerta tono="exito">{estado.ok}</Alerta>}

        <Campo
          label="Certificado (PEM)"
          ayuda="El .crt que descargaste del portal de ARCA, incluyendo las líneas BEGIN/END CERTIFICATE"
        >
          <TextArea
            name="certPem"
            rows={5}
            className="font-mono text-[11px]"
            placeholder="-----BEGIN CERTIFICATE-----"
          />
        </Campo>
        <Campo
          label="Clave privada (PEM)"
          ayuda="La clave con la que generaste el CSR. Se guarda cifrada con AES-256 y nunca se muestra."
        >
          <TextArea
            name="keyPem"
            rows={5}
            className="font-mono text-[11px]"
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </Campo>

        <div className="flex flex-wrap gap-2">
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar certificado"}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            disabled={enCurso}
            onClick={() => startTransition(async () => setPrueba(await probarConexion()))}
          >
            {enCurso ? "Probando…" : "Probar conexión"}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            disabled={enCurso}
            onClick={() => startTransition(async () => setPrueba(await sincronizarPuntosVenta()))}
          >
            Sincronizar puntos de venta
          </Boton>
        </div>
      </form>

      {prueba?.ok && (
        <div className="mt-4">
          <Alerta tono="exito">{prueba.ok}</Alerta>
        </div>
      )}
      {prueba?.error && (
        <div className="mt-4">
          <Alerta tono="error">{prueba.error}</Alerta>
        </div>
      )}
    </Card>
  );
}
