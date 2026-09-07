"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { registrarAuditoria, requerirPermiso } from "@/lib/auth";
import { validarCuit } from "@/lib/fiscal";
import { inspeccionarCertificado } from "@/lib/arca/wsaa";
import { dummy, puntosDeVenta, ultimoAutorizado } from "@/lib/arca/wsfev1";
import { verificarSmtp } from "@/lib/email";

export type EstadoForm = { error?: string; ok?: string };

export async function guardarEmpresa(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sesion = await requerirPermiso("config:escribir");
  const g = (k: string) => String(formData.get(k) ?? "").trim();

  const cuit = g("cuit").replace(/\D/g, "");
  if (!validarCuit(cuit)) return { error: "El CUIT ingresado no es válido" };

  const datos = {
    razonSocial: g("razonSocial"),
    nombreFantasia: g("nombreFantasia") || null,
    cuit,
    condicionIVA: g("condicionIVA") as never,
    ingresosBrutos: g("ingresosBrutos") || null,
    inicioActividades: g("inicioActividades") ? new Date(`${g("inicioActividades")}T00:00:00`) : null,
    domicilio: g("domicilio") || null,
    localidad: g("localidad") || null,
    provincia: g("provincia") || null,
    codigoPostal: g("codigoPostal") || null,
    telefono: g("telefono") || null,
    email: g("email") || null,
    web: g("web") || null,
    arcaAmbiente: g("arcaAmbiente") as never,
    ptoVtaDefault: Number(g("ptoVtaDefault") || 1),
    conceptoDefault: Number(g("conceptoDefault") || 2),
    diasVtoPagoDefault: Number(g("diasVtoPagoDefault") || 0),
    leyendaPie: g("leyendaPie") || null,
  };

  if (!datos.razonSocial) return { error: "La razón social es obligatoria" };

  await prisma.empresa.upsert({ where: { id: 1 }, create: { id: 1, ...datos }, update: datos });
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "CONFIG",
    entidad: "Empresa",
    entidadId: "1",
  });

  revalidatePath("/configuracion");
  return { ok: "Configuración guardada" };
}

export async function guardarCertificado(
  _prev: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const sesion = await requerirPermiso("config:escribir");

  const certPem = String(formData.get("certPem") ?? "").trim();
  const keyPem = String(formData.get("keyPem") ?? "").trim();

  if (!certPem.includes("BEGIN CERTIFICATE")) {
    return { error: "El certificado debe estar en formato PEM (BEGIN CERTIFICATE)" };
  }
  if (!keyPem.includes("PRIVATE KEY")) {
    return { error: "La clave privada debe estar en formato PEM (BEGIN PRIVATE KEY)" };
  }

  let info;
  try {
    info = inspeccionarCertificado(certPem);
  } catch {
    return { error: "No se pudo leer el certificado: revisá que esté completo" };
  }

  try {
    await prisma.empresa.update({
      where: { id: 1 },
      data: {
        arcaCertEncrypted: encrypt(certPem),
        arcaKeyEncrypted: encrypt(keyPem),
        arcaCertVencimiento: info.vence,
        arcaCertSubject: info.subject,
        arcaUltimoError: null,
      },
    });
    // Un certificado nuevo invalida los tickets cacheados.
    await prisma.ticketAcceso.deleteMany({});
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "CONFIG",
    entidad: "Empresa",
    entidadId: "1",
    detalle: { certificado: info.subject, vence: info.vence },
  });

  revalidatePath("/configuracion");
  return { ok: `Certificado cargado. Vence el ${info.vence.toLocaleDateString("es-AR")}.` };
}

export async function guardarSmtp(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requerirPermiso("config:escribir");
  const g = (k: string) => String(formData.get(k) ?? "").trim();

  const password = g("smtpPassword");

  try {
    await prisma.empresa.update({
      where: { id: 1 },
      data: {
        smtpHost: g("smtpHost") || null,
        smtpPort: Number(g("smtpPort") || 587),
        smtpSeguro: formData.get("smtpSeguro") === "on",
        smtpUsuario: g("smtpUsuario") || null,
        ...(password ? { smtpPassEncrypted: encrypt(password) } : {}),
        emailRemitente: g("emailRemitente") || null,
        emailCopia: g("emailCopia") || null,
        enviarEmailAuto: formData.get("enviarEmailAuto") === "on",
        asuntoEmail: g("asuntoEmail") || null,
        cuerpoEmail: g("cuerpoEmail") || null,
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/configuracion");
  return { ok: "Configuración de email guardada" };
}

export async function probarSmtp(): Promise<EstadoForm> {
  await requerirPermiso("config:leer");
  try {
    return { ok: await verificarSmtp() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function probarConexion(): Promise<EstadoForm> {
  await requerirPermiso("config:leer");
  try {
    const estado = await dummy();
    const pdv = await puntosDeVenta();
    return {
      ok: `Servidores de ARCA: app ${estado.appserver}, base ${estado.dbserver}, auth ${estado.authserver}. Puntos de venta habilitados: ${
        pdv.map((p) => p.nro).join(", ") || "ninguno"
      }.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sincronizarPuntosVenta(): Promise<EstadoForm> {
  await requerirPermiso("config:escribir");
  try {
    const pdv = await puntosDeVenta();
    for (const p of pdv) {
      await prisma.puntoVenta.upsert({
        where: { numero: p.nro },
        create: { numero: p.nro, descripcion: p.tipo, activo: p.bloqueado !== "S" },
        update: { descripcion: p.tipo, activo: p.bloqueado !== "S" },
      });
    }
    revalidatePath("/configuracion");
    return { ok: `Se sincronizaron ${pdv.length} puntos de venta desde ARCA.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function consultarUltimoNumero(_prev: EstadoForm, formData: FormData) {
  await requerirPermiso("config:leer");
  const ptoVta = Number(formData.get("ptoVta") ?? 1);
  const cbteTipo = Number(formData.get("cbteTipo") ?? 1);
  try {
    const n = await ultimoAutorizado(ptoVta, cbteTipo);
    return { ok: `Último autorizado en ARCA para ese punto de venta y tipo: ${n}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function crearPuntoVenta(formData: FormData) {
  await requerirPermiso("config:escribir");
  const numero = Number(formData.get("numero"));
  if (!numero || numero < 1) throw new Error("Número de punto de venta inválido");
  await prisma.puntoVenta.upsert({
    where: { numero },
    create: { numero, descripcion: String(formData.get("descripcion") ?? "") || null },
    update: { activo: true },
  });
  revalidatePath("/configuracion");
}
