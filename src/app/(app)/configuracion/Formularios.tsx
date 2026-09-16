"use client";

import { useActionState, useState, useTransition } from "react";
import {
  guardarCertificado,
  guardarEmpresa,
  probarConexion,
  probarSmtp,
  guardarSmtp,
  guardarLogo,
  quitarLogo,
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

type SmtpPlano = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSeguro: boolean;
  smtpUsuario: string | null;
  tienePassword: boolean;
  emailRemitente: string | null;
  emailCopia: string | null;
  enviarEmailAuto: boolean;
  asuntoEmail: string | null;
  cuerpoEmail: string | null;
};

export function SmtpForm({
  smtp,
  asuntoDefault,
  cuerpoDefault,
}: {
  smtp: SmtpPlano | null;
  asuntoDefault: string;
  cuerpoDefault: string;
}) {
  const [estado, accion, pendiente] = useActionState(guardarSmtp, {} as EstadoForm);
  const [prueba, setPrueba] = useState<EstadoForm | null>(null);
  const [enCurso, startTransition] = useTransition();

  return (
    <Card
      title="Envío de comprobantes por email"
      descripcion="Servidor SMTP y plantilla del mensaje que acompaña al PDF"
    >
      <form action={accion} className="space-y-4">
        {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}
        {estado?.ok && <Alerta tono="exito">{estado.ok}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Servidor SMTP">
            <Input name="smtpHost" placeholder="smtp.gmail.com" defaultValue={smtp?.smtpHost ?? ""} />
          </Campo>
          <Campo label="Puerto">
            <Input name="smtpPort" type="number" defaultValue={smtp?.smtpPort ?? 587} />
          </Campo>
          <Campo label="Usuario">
            <Input name="smtpUsuario" defaultValue={smtp?.smtpUsuario ?? ""} />
          </Campo>
          <Campo
            label="Contraseña"
            ayuda={smtp?.tienePassword ? "Ya hay una guardada; dejalo vacío para no cambiarla" : "Se guarda cifrada"}
          >
            <Input name="smtpPassword" type="password" autoComplete="new-password" />
          </Campo>
          <Campo label="Remitente" ayuda="Dirección desde la que sale el email">
            <Input
              name="emailRemitente"
              type="email"
              defaultValue={smtp?.emailRemitente ?? ""}
            />
          </Campo>
          <Campo label="Copia oculta" ayuda="Opcional: copia de todo lo que se envía">
            <Input name="emailCopia" type="email" defaultValue={smtp?.emailCopia ?? ""} />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="smtpSeguro"
              defaultChecked={smtp?.smtpSeguro ?? false}
              className="h-4 w-4 rounded border-gray-300"
            />
            SMTPS directo (puerto 465)
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="enviarEmailAuto"
              defaultChecked={smtp?.enviarEmailAuto ?? false}
              className="h-4 w-4 rounded border-gray-300"
            />
            Enviar al autorizar
          </label>
        </div>

        <Campo
          label="Asunto"
          ayuda="Variables: {comprobante} {numero} {empresa} {cliente} {total} {periodo} {vencimiento} {cae}"
        >
          <Input name="asuntoEmail" defaultValue={smtp?.asuntoEmail ?? asuntoDefault} />
        </Campo>
        <Campo label="Cuerpo del mensaje">
          <TextArea name="cuerpoEmail" rows={8} defaultValue={smtp?.cuerpoEmail ?? cuerpoDefault} />
        </Campo>

        <div className="flex flex-wrap gap-2">
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Guardando…" : "Guardar configuración de email"}
          </Boton>
          <Boton
            type="button"
            variante="secundario"
            disabled={enCurso}
            onClick={() => startTransition(async () => setPrueba(await probarSmtp()))}
          >
            {enCurso ? "Probando…" : "Probar conexión SMTP"}
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

export function LogoForm({ logoBase64 }: { logoBase64: string | null }) {
  const [estado, accion, pendiente] = useActionState(guardarLogo, {} as EstadoForm);

  return (
    <Card
      title="Logo"
      descripcion="Se imprime arriba a la izquierda en el PDF del comprobante. PNG o JPG, hasta 400 KB."
    >
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex h-24 w-48 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2">
          {logoBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${logoBase64}`}
              alt="Logo de la empresa"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-gray-400">Sin logo</span>
          )}
        </div>

        <form action={accion} className="flex flex-wrap items-end gap-3">
          <Campo label="Nuevo logo">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg"
              className="block w-64 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-marca-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-marca-700"
            />
          </Campo>
          <Boton type="submit" disabled={pendiente}>
            {pendiente ? "Subiendo…" : "Subir logo"}
          </Boton>
        </form>

        {logoBase64 && (
          <form action={quitarLogo}>
            <Boton variante="fantasma" type="submit">
              Quitar
            </Boton>
          </form>
        )}
      </div>

      {estado?.error && (
        <div className="mt-4">
          <Alerta tono="error">{estado.error}</Alerta>
        </div>
      )}
      {estado?.ok && (
        <div className="mt-4">
          <Alerta tono="exito">{estado.ok}</Alerta>
        </div>
      )}
    </Card>
  );
}
