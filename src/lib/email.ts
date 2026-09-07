import "server-only";
import nodemailer from "nodemailer";
import { prisma, dec } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { generarPdfComprobante, nombreArchivoPdf } from "@/lib/pdf";
import {
  NOMBRE_COMPROBANTE,
  formatearMoneda,
  formatearNumero,
} from "@/lib/fiscal";

/**
 * Envío del comprobante por email al cliente, con el PDF adjunto.
 * Los datos del servidor SMTP se configuran en Configuración; la contraseña se
 * guarda cifrada igual que el certificado de ARCA.
 */

const ASUNTO_DEFAULT = "{comprobante} {numero} — {empresa}";
const CUERPO_DEFAULT = `Hola{contacto},

Te enviamos adjunta la {comprobante} {numero} por {total}, correspondiente al período {periodo}.

Vencimiento del pago: {vencimiento}.

Cualquier duda quedamos a disposición.

{empresa}`;

function reemplazar(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export class ErrorEmail extends Error {}

export async function enviarComprobantePorEmail(
  comprobanteId: string,
  destinatarioManual?: string,
): Promise<{ destino: string }> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });

  if (!empresa.smtpHost || !empresa.emailRemitente) {
    throw new ErrorEmail("Falta configurar el servidor SMTP en Configuración");
  }

  const c = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    include: { cliente: true, puntoVenta: true },
  });

  if (c.estado !== "AUTORIZADO") {
    throw new ErrorEmail("Sólo se envían comprobantes autorizados por ARCA");
  }

  const destino =
    destinatarioManual?.trim() || c.cliente.emailFacturacion || c.cliente.email || "";
  if (!destino) {
    throw new ErrorEmail("El cliente no tiene email de facturación cargado");
  }

  const numero = formatearNumero(c.puntoVenta.numero, c.numero);
  const vars = {
    comprobante: NOMBRE_COMPROBANTE[c.tipo],
    numero,
    empresa: empresa.nombreFantasia || empresa.razonSocial,
    cliente: c.cliRazonSocial,
    contacto: c.cliente.contacto ? ` ${c.cliente.contacto}` : "",
    total: formatearMoneda(dec(c.importeTotal), c.moneda),
    periodo: c.periodo ?? "",
    vencimiento: c.fechaVtoPago?.toLocaleDateString("es-AR") ?? "a la vista",
    cae: c.cae ?? "",
  };

  const pdf = await generarPdfComprobante(comprobanteId);

  const transporte = nodemailer.createTransport({
    host: empresa.smtpHost,
    port: empresa.smtpPort ?? 587,
    secure: empresa.smtpSeguro,
    auth: empresa.smtpUsuario
      ? {
          user: empresa.smtpUsuario,
          pass: empresa.smtpPassEncrypted ? decrypt(empresa.smtpPassEncrypted) : "",
        }
      : undefined,
  });

  try {
    await transporte.sendMail({
      from: `"${empresa.nombreFantasia || empresa.razonSocial}" <${empresa.emailRemitente}>`,
      to: destino,
      bcc: empresa.emailCopia || undefined,
      subject: reemplazar(empresa.asuntoEmail || ASUNTO_DEFAULT, vars),
      text: reemplazar(empresa.cuerpoEmail || CUERPO_DEFAULT, vars),
      attachments: [
        {
          filename: nombreArchivoPdf({
            tipo: c.tipo,
            ptoVta: c.puntoVenta.numero,
            numero: c.numero,
            cliRazonSocial: c.cliRazonSocial,
          }),
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await prisma.comprobante.update({
      where: { id: comprobanteId },
      data: { emailError: mensaje, emailDestino: destino },
    });
    throw new ErrorEmail(`No se pudo enviar el email: ${mensaje}`);
  }

  await prisma.comprobante.update({
    where: { id: comprobanteId },
    data: { emailEnviadoAt: new Date(), emailDestino: destino, emailError: null },
  });

  return { destino };
}

/** Prueba la conexión con el servidor SMTP sin mandar nada. */
export async function verificarSmtp(): Promise<string> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });
  if (!empresa.smtpHost) throw new ErrorEmail("Falta configurar el servidor SMTP");

  const transporte = nodemailer.createTransport({
    host: empresa.smtpHost,
    port: empresa.smtpPort ?? 587,
    secure: empresa.smtpSeguro,
    auth: empresa.smtpUsuario
      ? {
          user: empresa.smtpUsuario,
          pass: empresa.smtpPassEncrypted ? decrypt(empresa.smtpPassEncrypted) : "",
        }
      : undefined,
  });

  await transporte.verify();
  return `Conexión correcta con ${empresa.smtpHost}:${empresa.smtpPort ?? 587}`;
}

export { ASUNTO_DEFAULT, CUERPO_DEFAULT };
