import forge from "node-forge";
import { ErrorArca } from "./config";

/**
 * Firma CMS (PKCS#7 signed data) del Ticket de Requerimiento de Acceso y
 * lectura del certificado. Son funciones puras: no tocan la base ni la red,
 * así se pueden probar de forma aislada.
 */

/** Arma el XML del TRA que pide el WSAA. */
export function construirTRA(servicio: string, ahora = new Date()): string {
  const isoConOffset = (d: Date): string => {
    const off = -d.getTimezoneOffset();
    const signo = off >= 0 ? "+" : "-";
    const p = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
      `${signo}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
    );
  };

  // Margen hacia atrás y adelante por desfasajes de reloj con ARCA.
  const desde = new Date(ahora.getTime() - 10 * 60 * 1000);
  const hasta = new Date(ahora.getTime() + 10 * 60 * 1000);

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId>
    <generationTime>${isoConOffset(desde)}</generationTime>
    <expirationTime>${isoConOffset(hasta)}</expirationTime>
  </header>
  <service>${servicio.replace(/[<>&]/g, "")}</service>
</loginTicketRequest>`;
}

/** Firma el TRA en CMS, como pide el LoginCms del WSAA. */
export function firmarCMS(tra: string, certPem: string, keyPem: string): string {
  let certificado: forge.pki.Certificate;
  let clave: forge.pki.rsa.PrivateKey;

  try {
    certificado = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new ErrorArca("El certificado no es un PEM válido (se espera BEGIN CERTIFICATE)");
  }
  try {
    clave = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  } catch {
    throw new ErrorArca(
      "La clave privada no es un PEM válido (se espera BEGIN PRIVATE KEY / RSA PRIVATE KEY)",
    );
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(certificado);
  p7.addSigner({
    key: clave,
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toString() },
    ],
  });
  p7.sign();

  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

/** Metadatos del certificado, para mostrarlos en Configuración. */
export function inspeccionarCertificado(certPem: string): {
  subject: string;
  emisor: string;
  desde: Date;
  vence: Date;
} {
  const cert = forge.pki.certificateFromPem(certPem);
  const attrs = (a: forge.pki.CertificateField[]) =>
    a.map((x) => `${x.shortName ?? x.name}=${x.value}`).join(", ");
  return {
    subject: attrs(cert.subject.attributes),
    emisor: attrs(cert.issuer.attributes),
    desde: cert.validity.notBefore,
    vence: cert.validity.notAfter,
  };
}
