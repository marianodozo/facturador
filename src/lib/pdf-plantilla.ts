import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { CondicionIVA, TipoComprobante, TipoDocumento } from "@prisma/client";
import { dec } from "@/lib/decimal";
import { URL_QR } from "@/lib/arca/config";
import {
  CODIGO_COMPROBANTE,
  CODIGO_DOCUMENTO,
  NOMBRE_COMPROBANTE,
  NOMBRE_CONDICION_IVA,
  discriminaIVA,
  esClaseC,
  formatearCuit,
  formatearNumero,
  letraComprobante,
} from "@/lib/fiscal";

/**
 * PDF del comprobante.
 *
 * El diseño sigue el formato clásico de la factura argentina: encabezado en
 * dos mitades con el recuadro de la letra en el medio, datos del receptor,
 * detalle, y al pie el QR con el CAE junto a los totales.
 */

const NEGRO = "#000000";
const GRIS = "#555555";
const LINEA = "#999999";
const FONDO_TABLA = "#d9d9d9";

// Geometría de la página (A4 en puntos)
const X = 28;
const W = 539;
const Y_PIE = 688; // arranque del bloque de CAE y totales
const Y_ITEMS_MAX = Y_PIE - 14;

function fecha(d: Date | null | undefined): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "IVA Responsable Inscripto" ya va precedido de la etiqueta IVA en el PDF. */
function condicionIVA(c: CondicionIVA): string {
  return NOMBRE_CONDICION_IVA[c].replace(/^IVA /, "").toUpperCase();
}

/** 21 en vez de 21,00 cuando la alícuota es entera. */
function alicuota(n: number): string {
  return Number.isInteger(n) ? String(n) : num(n);
}

function num(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pesos(n: number, moneda = "PES"): string {
  return `${moneda === "DOL" ? "US$" : "$"} ${num(n)}`;
}

/** Título del recuadro grande: la letra va aparte, en su propio cuadro. */
function tituloComprobante(tipo: TipoComprobante): string {
  if (tipo.startsWith("NOTA_CREDITO")) return "NOTA DE CRÉDITO";
  if (tipo.startsWith("NOTA_DEBITO")) return "NOTA DE DÉBITO";
  return "FACTURA";
}

/** Payload del QR obligatorio de ARCA (RG 4892). */
export function datosQR(c: {
  fechaEmision: Date;
  cuitEmisor: string;
  ptoVta: number;
  tipo: TipoComprobante;
  numero: number;
  importeTotal: number;
  moneda: string;
  cotizacion: number;
  tipoDocReceptor: keyof typeof CODIGO_DOCUMENTO;
  nroDocReceptor: string;
  cae: string;
}): string {
  const payload = {
    ver: 1,
    fecha: c.fechaEmision.toISOString().slice(0, 10),
    cuit: Number(c.cuitEmisor.replace(/\D/g, "")),
    ptoVta: c.ptoVta,
    tipoCmp: CODIGO_COMPROBANTE[c.tipo],
    nroCmp: c.numero,
    importe: Number(c.importeTotal.toFixed(2)),
    moneda: c.moneda,
    ctz: Number(c.cotizacion.toFixed(2)),
    tipoDocRec: CODIGO_DOCUMENTO[c.tipoDocReceptor],
    nroDocRec: Number(c.nroDocReceptor.replace(/\D/g, "")) || 0,
    tipoCodAut: "E",
    codAut: Number(c.cae),
  };
  return URL_QR + Buffer.from(JSON.stringify(payload)).toString("base64");
}

/** Etiqueta en negrita seguida de su valor, en una sola línea. */
function campo(
  doc: PDFKit.PDFDocument,
  etiqueta: string,
  valor: string,
  x: number,
  y: number,
  ancho: number,
) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NEGRO);
  doc.text(etiqueta, x, y, { lineBreak: false });
  const w = doc.widthOfString(etiqueta);
  doc.font("Helvetica").fillColor(NEGRO);
  doc.text(valor, x + w + 3, y, { width: ancho - w - 3, lineBreak: false, ellipsis: true });
}

/**
 * Todo lo que el PDF necesita, ya resuelto. Al no depender de Prisma ni de la
 * base, la plantilla se puede renderizar con datos de prueba para revisarla.
 */
export interface DatosPdf {
  empresa: {
    razonSocial: string;
    cuit: string;
    condicionIVA: CondicionIVA;
    domicilio: string | null;
    localidad: string | null;
    ingresosBrutos: string | null;
    inicioActividades: Date | null;
    leyendaPie: string | null;
    logoBase64: string | null;
  };
  comprobante: {
    tipo: TipoComprobante;
    numero: number | null;
    fechaEmision: Date;
    fechaVtoPago: Date | null;
    servicioDesde: Date | null;
    servicioHasta: Date | null;
    moneda: string;
    cotizacion: unknown;
    importeNeto: unknown;
    importeExento: unknown;
    importeTotal: unknown;
    cae: string | null;
    caeVencimiento: Date | null;
    motivoNota: string | null;
    cliRazonSocial: string;
    cliTipoDoc: TipoDocumento;
    cliNroDoc: string;
    cliCondicionIVA: CondicionIVA;
    cliDomicilio: string | null;
    cliLocalidad: string | null;
    cliProvincia: string | null;
    cliEmail: string | null;
    cliCondicionPago: string | null;
    puntoVenta: { numero: number; descripcion: string | null };
    cliente: {
      email: string | null;
      emailFacturacion: string | null;
      localidad: string | null;
      provincia: string | null;
      condicionPago: string | null;
    };
    items: {
      descripcion: string;
      cantidad: unknown;
      precioUnitario: unknown;
      alicuotaIVA: unknown;
      importeNeto: unknown;
      importeTotal: unknown;
    }[];
    lineasIVA: { alicuota: unknown; importe: unknown }[];
    comprobanteAsociado: {
      tipo: TipoComprobante;
      numero: number | null;
      puntoVenta: { numero: number };
    } | null;
  };
}

export async function construirPdf(d: DatosPdf): Promise<Buffer> {
  const c = d.comprobante;
  const empresa = d.empresa;

  const doc = new PDFDocument({ size: "A4", margin: X, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const listo = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));

  const letra = letraComprobante(c.tipo);
  const discrimina = discriminaIVA(c.tipo);
  const claseC = esClaseC(c.tipo);
  const centro = X + W / 2;

  // ---------------------------------------------------------------- encabezado
  const yEnc = 28;
  const hEnc = 96;

  doc.lineWidth(0.8).strokeColor(NEGRO);
  doc.rect(X, yEnc, W, hEnc).stroke();
  // El divisor arranca debajo del recuadro de la letra
  doc.moveTo(centro, yEnc + 50).lineTo(centro, yEnc + hEnc).stroke();

  // --- mitad izquierda: logo y datos del emisor
  let xTextoEmisor = X + 14;
  let anchoEmisor = centro - 24 - xTextoEmisor;

  if (empresa.logoBase64) {
    try {
      const limpio = empresa.logoBase64.replace(/^data:image\/\w+;base64,/, "");
      doc.image(Buffer.from(limpio, "base64"), X + 12, yEnc + 12, { fit: [104, 44] });
      xTextoEmisor = X + 124;
      anchoEmisor = centro - 26 - xTextoEmisor;
    } catch {
      // un logo ilegible no puede impedir que salga la factura
    }
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor(NEGRO);
  doc.text(empresa.razonSocial, xTextoEmisor, yEnc + 14, { width: anchoEmisor, align: "center" });

  doc.font("Helvetica").fontSize(7.5).fillColor(NEGRO);
  const lineasEmisor = [
    c.puntoVenta.descripcion || "CASA CENTRAL",
    [empresa.domicilio, empresa.localidad].filter(Boolean).join(", "),
  ].filter(Boolean);
  doc.text(lineasEmisor.join("\n"), xTextoEmisor, yEnc + 32, {
    width: anchoEmisor,
    align: "center",
  });

  // --- recuadro de la letra
  doc.rect(centro - 24, yEnc, 48, 50).fillAndStroke("#ffffff", NEGRO);
  doc.font("Helvetica-Bold").fontSize(26).fillColor(NEGRO);
  doc.text(letra, centro - 24, yEnc + 8, { width: 48, align: "center" });
  doc.font("Helvetica").fontSize(6);
  doc.text("Cod.", centro - 24, yEnc + 34, { width: 48, align: "center" });
  doc.text(String(CODIGO_COMPROBANTE[c.tipo]).padStart(3, "0"), centro - 24, yEnc + 41, {
    width: 48,
    align: "center",
  });

  // --- mitad derecha: identificación del comprobante
  const xDer = centro + 28;
  const anchoDer = X + W - xDer - 12;

  doc.font("Helvetica-Bold").fontSize(17).fillColor(NEGRO);
  doc.text(tituloComprobante(c.tipo), xDer, yEnc + 8, { width: anchoDer, align: "right" });

  doc.font("Helvetica").fontSize(12);
  doc.text(`Nº ${formatearNumero(c.puntoVenta.numero, c.numero)}`, xDer, yEnc + 30, {
    width: anchoDer,
    align: "right",
  });

  doc.font("Helvetica-Bold").fontSize(11);
  doc.text(`FECHA: ${fecha(c.fechaEmision)}`, xDer, yEnc + 48, {
    width: anchoDer,
    align: "right",
  });

  doc.font("Helvetica").fontSize(7).fillColor(GRIS);
  doc.text(
    `${condicionIVA(empresa.condicionIVA)}    CUIT: ${empresa.cuit}`,
    xDer,
    yEnc + 66,
    { width: anchoDer, align: "right" },
  );
  doc.text(
    `INICIO ACT.: ${fecha(empresa.inicioActividades)}   ING. BRUTOS: ${empresa.ingresosBrutos ?? ""}`,
    xDer,
    yEnc + 77,
    { width: anchoDer, align: "right" },
  );

  // ---------------------------------------------------------------- receptor
  const yRec = yEnc + hEnc;
  const hRec = 86;
  doc.rect(X, yRec, W, hRec).stroke();

  const xIzq = X + 8;
  const xDer2 = centro + 8;
  const anchoCol = centro - xIzq - 16;
  const anchoCol2 = X + W - xDer2 - 8;

  campo(doc, "SEÑOR/ES:", c.cliRazonSocial, xIzq, yRec + 8, anchoCol);
  campo(doc, "DOMICILIO:", c.cliDomicilio ?? "", xIzq, yRec + 22, anchoCol);
  campo(
    doc,
    "CORREO ELECTRÓNICO:",
    c.cliEmail ?? c.cliente.emailFacturacion ?? c.cliente.email ?? "",
    xIzq,
    yRec + 36,
    anchoCol,
  );
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NEGRO);
  doc.text("IVA:", xDer2, yRec + 8, { lineBreak: false });
  doc.font("Helvetica");
  doc.text(condicionIVA(c.cliCondicionIVA), xDer2 + 22, yRec + 8, { lineBreak: false });
  campo(
    doc,
    `${c.cliTipoDoc}:`,
    c.cliTipoDoc === "CUIT" ? formatearCuit(c.cliNroDoc) : c.cliNroDoc,
    xDer2 + 160,
    yRec + 8,
    anchoCol2 - 160,
  );
  campo(
    doc,
    "LOCALIDAD:",
    c.cliLocalidad ?? c.cliente.localidad ?? "",
    xDer2,
    yRec + 22,
    anchoCol2,
  );
  campo(
    doc,
    "PROVINCIA:",
    c.cliProvincia ?? c.cliente.provincia ?? "",
    xDer2,
    yRec + 36,
    anchoCol2,
  );
  campo(
    doc,
    "CONDICIÓN DE PAGO:",
    c.cliCondicionPago ?? c.cliente.condicionPago ?? (c.fechaVtoPago ? `Vence ${fecha(c.fechaVtoPago)}` : "Contado"),
    xDer2,
    yRec + 50,
    anchoCol2,
  );

  doc.moveTo(X, yRec + 64).lineTo(X + W, yRec + 64).strokeColor(LINEA).stroke();
  doc.strokeColor(NEGRO);

  const observaciones = [
    c.servicioDesde && c.servicioHasta
      ? `Período facturado: ${fecha(c.servicioDesde)} al ${fecha(c.servicioHasta)}`
      : null,
    c.fechaVtoPago ? `Vencimiento del pago: ${fecha(c.fechaVtoPago)}` : null,
    c.comprobanteAsociado
      ? `Asociado a ${NOMBRE_COMPROBANTE[c.comprobanteAsociado.tipo]} ${formatearNumero(
          c.comprobanteAsociado.puntoVenta.numero,
          c.comprobanteAsociado.numero,
        )}${c.motivoNota ? ` — ${c.motivoNota}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join("   ·   ");

  campo(doc, "OBSERVACIONES:", observaciones, xIzq, yRec + 70, W - 20);

  // ---------------------------------------------------------------- detalle
  const yTabla = yRec + hRec + 10;

  const anchoCant = 45;
  const anchoPrecio = 72;
  const anchoSub = 72;
  const anchoAlic = 34;
  const anchoSubIva = 78;

  const xSubIva = X + W - anchoSubIva;
  const xAlic = xSubIva - anchoAlic;
  const xSub = discrimina ? xAlic - anchoSub : X + W - anchoSub;
  const xPrecio = xSub - anchoPrecio;
  const xCant = xPrecio - anchoCant;
  const anchoDesc = xCant - X - 8;

  function encabezadoTabla(y: number) {
    doc.rect(X, y, W, 18).fillAndStroke(FONDO_TABLA, LINEA);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NEGRO);
    doc.text("Descripción", X + 6, y + 6, { width: anchoDesc, lineBreak: false });
    doc.text("Cant.", xCant, y + 6, { width: anchoCant - 4, align: "right" });
    doc.text(discrimina ? "Precio Uni." : "Precio Uni.", xPrecio, y + 6, {
      width: anchoPrecio - 4,
      align: "right",
    });
    doc.text("Sub Total", xSub, y + 6, { width: anchoSub - 4, align: "right" });
    if (discrimina) {
      doc.text("% IVA", xAlic, y + 6, { width: anchoAlic - 4, align: "right" });
      doc.text("Sub Total c/IVA", xSubIva, y + 6, { width: anchoSubIva - 6, align: "right" });
    }
    return y + 18;
  }

  let y = encabezadoTabla(yTabla);

  doc.font("Helvetica").fontSize(8).fillColor(NEGRO);
  for (const it of c.items) {
    const alto = Math.max(doc.heightOfString(it.descripcion, { width: anchoDesc }), 10);

    if (y + alto + 6 > Y_ITEMS_MAX) {
      doc.addPage();
      y = encabezadoTabla(40);
      doc.font("Helvetica").fontSize(8).fillColor(NEGRO);
    }

    doc.text(it.descripcion, X + 6, y + 4, { width: anchoDesc });
    doc.text(num(dec(it.cantidad)), xCant, y + 4, { width: anchoCant - 4, align: "right" });
    doc.text(num(dec(it.precioUnitario)), xPrecio, y + 4, {
      width: anchoPrecio - 4,
      align: "right",
    });
    doc.text(num(discrimina ? dec(it.importeNeto) : dec(it.importeTotal)), xSub, y + 4, {
      width: anchoSub - 4,
      align: "right",
    });
    if (discrimina) {
      doc.text(alicuota(dec(it.alicuotaIVA)), xAlic, y + 4, {
        width: anchoAlic - 4,
        align: "right",
      });
      doc.text(num(dec(it.importeTotal)), xSubIva, y + 4, {
        width: anchoSubIva - 6,
        align: "right",
      });
    }

    y += alto + 8;
    doc.moveTo(X, y - 2).lineTo(X + W, y - 2).strokeColor("#eeeeee").stroke();
  }
  doc.strokeColor(NEGRO);

  // ---------------------------------------------------------------- pie
  const hPie = 96;
  doc.rect(X, Y_PIE, W, hPie).stroke();

  if (c.cae && c.numero) {
    const url = datosQR({
      fechaEmision: c.fechaEmision,
      cuitEmisor: empresa.cuit,
      ptoVta: c.puntoVenta.numero,
      tipo: c.tipo,
      numero: c.numero,
      importeTotal: dec(c.importeTotal),
      moneda: c.moneda,
      cotizacion: dec(c.cotizacion) || 1,
      tipoDocReceptor: c.cliTipoDoc,
      nroDocReceptor: c.cliNroDoc,
      cae: c.cae,
    });
    const png = await QRCode.toBuffer(url, { margin: 0, width: 240 });
    doc.image(png, X + 10, Y_PIE + 9, { fit: [78, 78] });

    doc.font("Helvetica-Bold").fontSize(8).fillColor(NEGRO);
    doc.text(`FECHA VTO: ${fecha(c.caeVencimiento)}`, X + 98, Y_PIE + 62, { lineBreak: false });
    doc.text(`CAE: ${c.cae}`, X + 98, Y_PIE + 74, { lineBreak: false });
    doc.font("Helvetica").fontSize(6.5).fillColor(GRIS);
    doc.text(
      "Comprobante autorizado por ARCA. Verificable con el código QR.",
      X + 98,
      Y_PIE + 86,
      { lineBreak: false },
    );
  } else {
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#b45309");
    doc.text("BORRADOR — SIN VALIDEZ FISCAL", X + 10, Y_PIE + 32, {
      width: 260,
      align: "center",
    });
    doc.font("Helvetica").fontSize(7.5).fillColor(GRIS);
    doc.text("Todavía no fue autorizado por ARCA.", X + 10, Y_PIE + 50, {
      width: 260,
      align: "center",
    });
  }

  // --- totales
  const xTot = X + W - 250;
  let yTot = Y_PIE + 14;

  const filas: [string, string][] = [];
  if (claseC) {
    filas.push(["SUBTOTAL:", pesos(dec(c.importeTotal), c.moneda)]);
  } else if (discrimina) {
    filas.push(["SUBTOTAL:", pesos(dec(c.importeNeto), c.moneda)]);
    if (dec(c.importeExento) > 0) {
      filas.push(["EXENTO:", pesos(dec(c.importeExento), c.moneda)]);
    }
    for (const l of c.lineasIVA.filter((l) => dec(l.alicuota) > 0)) {
      filas.push([`IVA ${alicuota(dec(l.alicuota))}%:`, pesos(dec(l.importe), c.moneda)]);
    }
  } else {
    filas.push(["SUBTOTAL:", pesos(dec(c.importeTotal), c.moneda)]);
  }

  doc.font("Helvetica").fontSize(9).fillColor(NEGRO);
  for (const [etiqueta, valor] of filas) {
    doc.text(etiqueta, xTot, yTot, { width: 120, align: "right" });
    doc.text(valor, xTot + 126, yTot, { width: 112, align: "right" });
    yTot += 15;
  }

  doc.font("Helvetica-Bold").fontSize(13);
  doc.text("TOTAL:", xTot, yTot + 4, { width: 120, align: "right" });
  doc.text(pesos(dec(c.importeTotal), c.moneda), xTot + 126, yTot + 4, {
    width: 112,
    align: "right",
  });

  if (!discrimina) {
    doc.font("Helvetica").fontSize(6.5).fillColor(GRIS);
    doc.text(
      claseC
        ? "El IVA no se discrimina por tratarse de un comprobante clase C."
        : "El IVA se encuentra incluido en el precio.",
      X,
      Y_PIE + hPie + 4,
      { width: W, align: "right" },
    );
  }

  if (empresa.leyendaPie) {
    doc.font("Helvetica").fontSize(7).fillColor(GRIS);
    doc.text(empresa.leyendaPie, X, 800, { width: W, align: "center" });
  }

  doc.end();
  return listo;
}

export function nombreArchivoPdf(c: {
  tipo: TipoComprobante;
  ptoVta: number;
  numero: number | null;
  cliRazonSocial: string;
}): string {
  const limpio = c.cliRazonSocial
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `${NOMBRE_COMPROBANTE[c.tipo].replace(/\s+/g, "-")}_${formatearNumero(
    c.ptoVta,
    c.numero,
  )}_${limpio}.pdf`;
}
