import "server-only";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { ENDPOINTS, ErrorArca } from "./config";
import { obtenerTicketAcceso } from "./wsaa";

/**
 * WSFEv1 — Facturación Electrónica de ARCA (comprobantes del mercado interno).
 * El SOAP se arma a mano para tener control exacto del orden de los elementos:
 * el WSDL define secuencias y el servicio rechaza los pedidos desordenados.
 */

const NS = "http://ar.gov.afip.dif.FEV1/";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function esc(v: string | number): string {
  return String(v).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

function tag(nombre: string, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  return `<ar:${nombre}>${esc(valor)}</ar:${nombre}>`;
}

async function llamar(metodo: string, cuerpoInterno: string): Promise<Record<string, unknown>> {
  const empresa = await prisma.empresa.findUnique({ where: { id: 1 } });
  if (!empresa) throw new ErrorArca("Falta configurar los datos de la empresa");

  const ta = await obtenerTicketAcceso();

  const auth = `<ar:Auth>${tag("Token", ta.token)}${tag("Sign", ta.sign)}${tag(
    "Cuit",
    ta.cuit.replace(/\D/g, ""),
  )}</ar:Auth>`;

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:${metodo}>${auth}${cuerpoInterno}</ar:${metodo}>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(ENDPOINTS[empresa.arcaAmbiente].wsfev1, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `${NS}${metodo}`,
    },
    body: envelope,
  });

  const texto = await res.text();
  const parsed = parser.parse(texto);

  const fault = parsed?.Envelope?.Body?.Fault;
  if (fault) {
    throw new ErrorArca(
      `WSFEv1 devolvió un fault en ${metodo}: ${fault.faultstring ?? ""}`,
      fault.faultcode,
      fault,
    );
  }

  const result = parsed?.Envelope?.Body?.[`${metodo}Response`]?.[`${metodo}Result`];
  if (!result) {
    throw new ErrorArca(`Respuesta inesperada de ${metodo}`, undefined, texto.slice(0, 1000));
  }

  const errores = normalizarLista(result?.Errors?.Err);
  if (errores.length) {
    throw new ErrorArca(
      errores.map((e) => `[${e.Code}] ${e.Msg}`).join(" | "),
      errores[0]?.Code,
      errores,
    );
  }

  return result as Record<string, unknown>;
}

function normalizarLista<T = Record<string, string>>(v: unknown): T[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

// --- Operaciones ----------------------------------------------------------

/** Chequeo de disponibilidad del servicio (no requiere autenticación real). */
export async function dummy(): Promise<{ appserver: string; dbserver: string; authserver: string }> {
  const empresa = await prisma.empresa.findUnique({ where: { id: 1 } });
  const url = ENDPOINTS[empresa?.arcaAmbiente ?? "PRODUCCION"].wsfev1;

  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}">
  <soapenv:Header/><soapenv:Body><ar:FEDummy/></soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `${NS}FEDummy` },
    body: envelope,
  });
  const r = parser.parse(await res.text())?.Envelope?.Body?.FEDummyResponse?.FEDummyResult ?? {};
  return {
    appserver: String(r.AppServer ?? "?"),
    dbserver: String(r.DbServer ?? "?"),
    authserver: String(r.AuthServer ?? "?"),
  };
}

/** Último número autorizado para un punto de venta y tipo de comprobante. */
export async function ultimoAutorizado(ptoVta: number, cbteTipo: number): Promise<number> {
  const r = await llamar(
    "FECompUltimoAutorizado",
    `${tag("PtoVta", ptoVta)}${tag("CbteTipo", cbteTipo)}`,
  );
  return Number(r.CbteNro ?? 0);
}

export interface AlicuotaIvaArca {
  Id: number;
  BaseImp: number;
  Importe: number;
}

export interface ComprobanteAsociadoArca {
  Tipo: number;
  PtoVta: number;
  Nro: number;
  Cuit?: string;
  CbteFch?: string;
}

export interface SolicitudCAE {
  ptoVta: number;
  cbteTipo: number;
  concepto: number; // 1 productos, 2 servicios, 3 ambos
  docTipo: number;
  docNro: string;
  cbteDesde: number;
  cbteHasta: number;
  cbteFch: string; // yyyymmdd
  impTotal: number;
  impTotConc: number; // no gravado
  impNeto: number;
  impOpEx: number; // exento
  impTrib: number;
  impIVA: number;
  fchServDesde?: string;
  fchServHasta?: string;
  fchVtoPago?: string;
  monId: string; // PES | DOL
  monCotiz: number;
  condicionIVAReceptorId: number;
  iva?: AlicuotaIvaArca[];
  cbtesAsoc?: ComprobanteAsociadoArca[];
}

export interface RespuestaCAE {
  resultado: "A" | "P" | "R";
  cae: string | null;
  caeVencimiento: string | null; // yyyymmdd
  numero: number | null;
  observaciones: { codigo: string; mensaje: string }[];
  errores: { codigo: string; mensaje: string }[];
}

function money(n: number): string {
  return n.toFixed(2);
}

/**
 * FECAESolicitar — solicita el CAE de un comprobante.
 * El orden de los elementos respeta la secuencia del WSDL.
 */
export async function solicitarCAE(s: SolicitudCAE): Promise<RespuestaCAE> {
  const requiereFechasServicio = s.concepto === 2 || s.concepto === 3;

  const iva = (s.iva ?? []).length
    ? `<ar:Iva>${s
        .iva!.map(
          (a) =>
            `<ar:AlicIva>${tag("Id", a.Id)}${tag("BaseImp", money(a.BaseImp))}${tag(
              "Importe",
              money(a.Importe),
            )}</ar:AlicIva>`,
        )
        .join("")}</ar:Iva>`
    : "";

  const asociados = (s.cbtesAsoc ?? []).length
    ? `<ar:CbtesAsoc>${s
        .cbtesAsoc!.map(
          (c) =>
            `<ar:CbteAsoc>${tag("Tipo", c.Tipo)}${tag("PtoVta", c.PtoVta)}${tag("Nro", c.Nro)}${tag(
              "Cuit",
              c.Cuit,
            )}${tag("CbteFch", c.CbteFch)}</ar:CbteAsoc>`,
        )
        .join("")}</ar:CbtesAsoc>`
    : "";

  const detalle =
    `<ar:FECAEDetRequest>` +
    tag("Concepto", s.concepto) +
    tag("DocTipo", s.docTipo) +
    tag("DocNro", s.docNro.replace(/\D/g, "") || "0") +
    tag("CbteDesde", s.cbteDesde) +
    tag("CbteHasta", s.cbteHasta) +
    tag("CbteFch", s.cbteFch) +
    tag("ImpTotal", money(s.impTotal)) +
    tag("ImpTotConc", money(s.impTotConc)) +
    tag("ImpNeto", money(s.impNeto)) +
    tag("ImpOpEx", money(s.impOpEx)) +
    tag("ImpTrib", money(s.impTrib)) +
    tag("ImpIVA", money(s.impIVA)) +
    (requiereFechasServicio ? tag("FchServDesde", s.fchServDesde) : "") +
    (requiereFechasServicio ? tag("FchServHasta", s.fchServHasta) : "") +
    (requiereFechasServicio ? tag("FchVtoPago", s.fchVtoPago) : "") +
    tag("MonId", s.monId) +
    tag("MonCotiz", s.monCotiz) +
    tag("CondicionIVAReceptorId", s.condicionIVAReceptorId) +
    asociados +
    iva +
    `</ar:FECAEDetRequest>`;

  const cuerpo =
    `<ar:FeCAEReq>` +
    `<ar:FeCabReq>${tag("CantReg", 1)}${tag("PtoVta", s.ptoVta)}${tag("CbteTipo", s.cbteTipo)}</ar:FeCabReq>` +
    `<ar:FeDetReq>${detalle}</ar:FeDetReq>` +
    `</ar:FeCAEReq>`;

  const r = await llamar("FECAESolicitar", cuerpo);

  const cab = (r as { FeCabResp?: Record<string, string> }).FeCabResp ?? {};
  const det = normalizarLista<Record<string, unknown>>(
    (r as { FeDetResp?: { FECAEDetResponse?: unknown } }).FeDetResp?.FECAEDetResponse,
  )[0];

  const observaciones = normalizarLista<{ Code: string; Msg: string }>(
    (det?.Observaciones as { Obs?: unknown } | undefined)?.Obs,
  ).map((o) => ({ codigo: String(o.Code), mensaje: String(o.Msg) }));

  const resultado = String(det?.Resultado ?? cab.Resultado ?? "R") as "A" | "P" | "R";

  return {
    resultado,
    cae: det?.CAE ? String(det.CAE) : null,
    caeVencimiento: det?.CAEFchVto ? String(det.CAEFchVto) : null,
    numero: det?.CbteDesde ? Number(det.CbteDesde) : null,
    observaciones,
    errores: [],
  };
}

/** Consulta un comprobante ya emitido. */
export async function consultarComprobante(
  ptoVta: number,
  cbteTipo: number,
  cbteNro: number,
): Promise<Record<string, unknown>> {
  return llamar(
    "FECompConsultar",
    `<ar:FeCompConsReq>${tag("CbteTipo", cbteTipo)}${tag("CbteNro", cbteNro)}${tag(
      "PtoVta",
      ptoVta,
    )}</ar:FeCompConsReq>`,
  );
}

/** Puntos de venta habilitados en ARCA para el CUIT configurado. */
export async function puntosDeVenta(): Promise<{ nro: number; tipo: string; bloqueado: string }[]> {
  const r = await llamar("FEParamGetPtosVenta", "");
  return normalizarLista<Record<string, string>>(
    (r as { ResultGet?: { PtoVenta?: unknown } }).ResultGet?.PtoVenta,
  ).map((p) => ({
    nro: Number(p.Nro),
    tipo: String(p.EmisionTipo ?? ""),
    bloqueado: String(p.Bloqueado ?? "N"),
  }));
}

/** Cotización oficial de una moneda (para facturar en dólares). */
export async function cotizacion(monId: string): Promise<number> {
  const r = await llamar("FEParamGetCotizacion", tag("MonId", monId));
  const c = (r as { ResultGet?: { MonCotiz?: string } }).ResultGet?.MonCotiz;
  return Number(c ?? 1);
}
