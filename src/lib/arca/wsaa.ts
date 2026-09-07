import "server-only";
import { XMLParser } from "fast-xml-parser";
import type { AmbienteArca } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { ENDPOINTS, ErrorArca, SERVICIO_WSFE } from "./config";
import { construirTRA, firmarCMS } from "./cms";

export { inspeccionarCertificado, firmarCMS, construirTRA } from "./cms";

/**
 * WSAA — Web Service de Autenticación y Autorización de ARCA.
 *
 * Se arma un Ticket de Requerimiento de Acceso (TRA), se firma con el
 * certificado y la clave privada en formato CMS/PKCS#7, se envía al LoginCms y
 * ARCA devuelve un Ticket de Acceso (token + sign) válido 12 horas. El TA se
 * cachea en la base: ARCA rechaza los pedidos repetidos mientras el anterior
 * siga vigente.
 */

export interface TicketAccesoData {
  token: string;
  sign: string;
  expiraEn: Date;
}

async function pedirTicketAccesoRemoto(
  ambiente: AmbienteArca,
  certPem: string,
  keyPem: string,
  servicio: string,
): Promise<TicketAccesoData> {
  const cms = firmarCMS(construirTRA(servicio), certPem, keyPem);

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(ENDPOINTS[ambiente].wsaa, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  });

  const texto = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
  const parsed = parser.parse(texto);

  const fault = parsed?.Envelope?.Body?.Fault;
  if (fault) {
    const detalle = String(fault.faultstring ?? "Error del WSAA");
    if (detalle.includes("alreadyAuthenticated") || detalle.includes("ya posee un TA")) {
      throw new ErrorArca(
        "ARCA informa que ya hay un ticket de acceso vigente. Esperá unos minutos o reutilizá el TA cacheado.",
        "wsaa.alreadyAuthenticated",
        detalle,
      );
    }
    throw new ErrorArca(`WSAA rechazó el pedido: ${detalle}`, fault.faultcode, detalle);
  }

  const respuesta = parsed?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;
  if (!respuesta) {
    throw new ErrorArca("Respuesta inesperada del WSAA", undefined, texto.slice(0, 800));
  }

  const ta = parser.parse(String(respuesta));
  const credenciales = ta?.loginTicketResponse?.credentials;
  const header = ta?.loginTicketResponse?.header;
  if (!credenciales?.token || !credenciales?.sign) {
    throw new ErrorArca("El WSAA no devolvió token/sign", undefined, respuesta);
  }

  return {
    token: String(credenciales.token),
    sign: String(credenciales.sign),
    expiraEn: header?.expirationTime
      ? new Date(String(header.expirationTime))
      : new Date(Date.now() + 11 * 60 * 60 * 1000),
  };
}

/**
 * Devuelve un TA vigente: usa el cacheado si le quedan más de 10 minutos y, si
 * no, pide uno nuevo.
 */
export async function obtenerTicketAcceso(
  servicio = SERVICIO_WSFE,
): Promise<TicketAccesoData & { cuit: string }> {
  const empresa = await prisma.empresa.findUnique({ where: { id: 1 } });
  if (!empresa) throw new ErrorArca("Falta configurar los datos de la empresa");
  if (!empresa.arcaCertEncrypted || !empresa.arcaKeyEncrypted) {
    throw new ErrorArca(
      "Falta cargar el certificado y la clave privada de ARCA en Configuración",
      "config.sin_certificado",
    );
  }

  const ambiente = empresa.arcaAmbiente;
  const cacheado = await prisma.ticketAcceso.findUnique({
    where: { servicio_ambiente: { servicio, ambiente } },
  });

  if (cacheado && cacheado.expiraEn.getTime() - Date.now() > 10 * 60 * 1000) {
    return {
      token: cacheado.token,
      sign: cacheado.sign,
      expiraEn: cacheado.expiraEn,
      cuit: empresa.cuit,
    };
  }

  const certPem = decrypt(empresa.arcaCertEncrypted);
  const keyPem = decrypt(empresa.arcaKeyEncrypted);

  try {
    const ta = await pedirTicketAccesoRemoto(ambiente, certPem, keyPem, servicio);

    await prisma.ticketAcceso.upsert({
      where: { servicio_ambiente: { servicio, ambiente } },
      create: {
        servicio,
        ambiente,
        token: ta.token,
        sign: ta.sign,
        generadoEn: new Date(),
        expiraEn: ta.expiraEn,
      },
      update: { token: ta.token, sign: ta.sign, generadoEn: new Date(), expiraEn: ta.expiraEn },
    });

    await prisma.empresa.update({
      where: { id: 1 },
      data: { arcaUltimaConexion: new Date(), arcaUltimoError: null },
    });

    return { ...ta, cuit: empresa.cuit };
  } catch (e) {
    // Si ARCA dice que ya hay un TA vigente y tenemos uno cacheado, lo usamos.
    if (e instanceof ErrorArca && e.codigo === "wsaa.alreadyAuthenticated" && cacheado) {
      return {
        token: cacheado.token,
        sign: cacheado.sign,
        expiraEn: cacheado.expiraEn,
        cuit: empresa.cuit,
      };
    }
    await prisma.empresa.update({
      where: { id: 1 },
      data: { arcaUltimoError: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
