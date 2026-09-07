import "server-only";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { prisma, dec } from "@/lib/db";
import { URL_QR } from "@/lib/arca/config";
import {
  CODIGO_COMPROBANTE,
  CODIGO_DOCUMENTO,
  NOMBRE_COMPROBANTE,
  NOMBRE_CONDICION_IVA,
  discriminaIVA,
  formatearCuit,
  formatearMoneda,
  formatearNumero,
  letraComprobante,
} from "@/lib/fiscal";

const GRIS = "#4b5563";
const NEGRO = "#111827";
const LINEA = "#d1d5db";

function fecha(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("es-AR") : "-";
}

/** Payload del QR obligatorio de ARCA (RG 4892). */
export function datosQR(c: {
  fechaEmision: Date;
  cuitEmisor: string;
  ptoVta: number;
  tipo: keyof typeof CODIGO_COMPROBANTE;
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

/** Genera el PDF del comprobante con el formato exigido por ARCA. */
export async function generarPdfComprobante(comprobanteId: string): Promise<Buffer> {
  const c = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    include: {
      cliente: true,
      items: { orderBy: { orden: "asc" } },
      lineasIVA: true,
      puntoVenta: true,
      comprobanteAsociado: true,
    },
  });
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });

  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 72;
  const X = 36;
  const letra = letraComprobante(c.tipo);
  const discrimina = discriminaIVA(c.tipo);

  // ---- Encabezado: dos columnas con el recuadro de la letra en el medio
  const topY = 40;
  doc.rect(X, topY, W, 118).strokeColor(LINEA).stroke();
  doc.moveTo(X + W / 2, topY).lineTo(X + W / 2, topY + 118).stroke();

  // Recuadro de la letra
  const cajaX = X + W / 2 - 26;
  doc.rect(cajaX, topY - 12, 52, 46).fillAndStroke("#ffffff", NEGRO);
  doc.fillColor(NEGRO).fontSize(28).font("Helvetica-Bold").text(letra, cajaX, topY - 4, {
    width: 52,
    align: "center",
  });
  doc.fontSize(6).font("Helvetica").text(`COD. ${String(CODIGO_COMPROBANTE[c.tipo]).padStart(3, "0")}`, cajaX, topY + 26, {
    width: 52,
    align: "center",
  });

  // Emisor
  doc.fillColor(NEGRO).font("Helvetica-Bold").fontSize(13);
  doc.text(empresa.nombreFantasia || empresa.razonSocial, X + 12, topY + 14, { width: W / 2 - 40 });
  doc.font("Helvetica").fontSize(8).fillColor(GRIS);
  const emisorLineas = [
    `Razón social: ${empresa.razonSocial}`,
    empresa.domicilio ? `Domicilio: ${empresa.domicilio}` : null,
    [empresa.localidad, empresa.provincia, empresa.codigoPostal].filter(Boolean).join(" · ") || null,
    `Condición frente al IVA: ${NOMBRE_CONDICION_IVA[empresa.condicionIVA]}`,
    empresa.telefono ? `Tel: ${empresa.telefono}` : null,
    empresa.email,
  ].filter(Boolean) as string[];
  doc.text(emisorLineas.join("\n"), X + 12, topY + 36, { width: W / 2 - 40 });

  // Datos del comprobante
  const cx = X + W / 2 + 12;
  doc.fillColor(NEGRO).font("Helvetica-Bold").fontSize(13);
  doc.text(NOMBRE_COMPROBANTE[c.tipo].toUpperCase(), cx, topY + 14);
  doc.font("Helvetica").fontSize(9).fillColor(NEGRO);
  doc.text(`Nº ${formatearNumero(c.puntoVenta.numero, c.numero)}`, cx, topY + 34);
  doc.fontSize(8).fillColor(GRIS);
  doc.text(
    [
      `Fecha de emisión: ${fecha(c.fechaEmision)}`,
      `CUIT: ${formatearCuit(empresa.cuit)}`,
      empresa.ingresosBrutos ? `Ingresos Brutos: ${empresa.ingresosBrutos}` : null,
      empresa.inicioActividades ? `Inicio de actividades: ${fecha(empresa.inicioActividades)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    cx,
    topY + 50,
    { width: W / 2 - 24 },
  );

  // ---- Período facturado
  let y = topY + 128;
  if (c.servicioDesde && c.servicioHasta) {
    doc.rect(X, y, W, 22).strokeColor(LINEA).stroke();
    doc.fontSize(8).fillColor(GRIS);
    doc.text(
      `Período facturado: ${fecha(c.servicioDesde)} al ${fecha(c.servicioHasta)}      Vencimiento del pago: ${fecha(c.fechaVtoPago)}`,
      X + 10,
      y + 7,
    );
    y += 30;
  }

  // ---- Receptor
  doc.rect(X, y, W, 56).strokeColor(LINEA).stroke();
  doc.fontSize(8).fillColor(GRIS);
  doc.text(
    [
      `${c.cliTipoDoc}: ${c.cliTipoDoc === "CUIT" ? formatearCuit(c.cliNroDoc) : c.cliNroDoc}`,
      `Razón social: ${c.cliRazonSocial}`,
      `Condición frente al IVA: ${NOMBRE_CONDICION_IVA[c.cliCondicionIVA]}`,
      c.cliDomicilio ? `Domicilio: ${c.cliDomicilio}` : "",
      c.cliente.condicionPago ? `Condición de venta: ${c.cliente.condicionPago}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    X + 10,
    y + 8,
    { width: W - 20 },
  );
  y += 66;

  if (c.comprobanteAsociado) {
    doc.fontSize(8).fillColor(GRIS).text(
      `Comprobante asociado: ${NOMBRE_COMPROBANTE[c.comprobanteAsociado.tipo]} ${formatearNumero(
        c.puntoVenta.numero,
        c.comprobanteAsociado.numero,
      )} del ${fecha(c.comprobanteAsociado.fechaEmision)}${c.motivoNota ? ` — ${c.motivoNota}` : ""}`,
      X,
      y,
    );
    y += 16;
  }

  // ---- Detalle
  const colDesc = X + 6;
  const colCant = X + W - 300;
  const colPrecio = X + W - 230;
  const colAlic = X + W - 140;
  const colTotal = X + W - 80;

  doc.rect(X, y, W, 18).fillAndStroke("#f3f4f6", LINEA);
  doc.fillColor(NEGRO).fontSize(8).font("Helvetica-Bold");
  doc.text("Descripción", colDesc, y + 5);
  doc.text("Cant.", colCant, y + 5, { width: 40, align: "right" });
  doc.text(discrimina ? "P. unitario" : "P. unit. c/IVA", colPrecio, y + 5, { width: 80, align: "right" });
  if (discrimina) doc.text("IVA", colAlic, y + 5, { width: 50, align: "right" });
  doc.text("Subtotal", colTotal, y + 5, { width: 74, align: "right" });
  y += 22;

  doc.font("Helvetica").fontSize(8).fillColor(NEGRO);
  for (const it of c.items) {
    const alto = doc.heightOfString(it.descripcion, { width: colCant - colDesc - 10 });
    doc.text(it.descripcion, colDesc, y, { width: colCant - colDesc - 10 });
    doc.text(dec(it.cantidad).toLocaleString("es-AR"), colCant, y, { width: 40, align: "right" });
    doc.text(formatearMoneda(dec(it.precioUnitario), c.moneda), colPrecio, y, {
      width: 80,
      align: "right",
    });
    if (discrimina) doc.text(`${dec(it.alicuotaIVA)}%`, colAlic, y, { width: 50, align: "right" });
    doc.text(
      formatearMoneda(discrimina ? dec(it.importeNeto) : dec(it.importeTotal), c.moneda),
      colTotal,
      y,
      { width: 74, align: "right" },
    );
    y += Math.max(alto, 11) + 4;
    if (y > 640) {
      doc.addPage();
      y = 50;
    }
  }

  doc.moveTo(X, y).lineTo(X + W, y).strokeColor(LINEA).stroke();
  y += 10;

  // ---- Totales
  const totX = X + W - 240;
  const filas: [string, number][] = [];
  if (discrimina) {
    filas.push(["Subtotal neto gravado", dec(c.importeNeto)]);
    if (dec(c.importeExento) > 0) filas.push(["Importe exento", dec(c.importeExento)]);
    if (dec(c.importeNoGravado) > 0) filas.push(["Importe no gravado", dec(c.importeNoGravado)]);
    for (const l of c.lineasIVA.filter((l) => dec(l.alicuota) > 0)) {
      filas.push([`IVA ${dec(l.alicuota)}%`, dec(l.importe)]);
    }
  } else {
    filas.push(["Subtotal", dec(c.importeTotal)]);
  }

  doc.fontSize(9);
  for (const [etiqueta, valor] of filas) {
    doc.fillColor(GRIS).text(etiqueta, totX, y, { width: 150, align: "right" });
    doc.fillColor(NEGRO).text(formatearMoneda(valor, c.moneda), totX + 155, y, {
      width: 85,
      align: "right",
    });
    y += 14;
  }
  doc.font("Helvetica-Bold").fontSize(11);
  doc.fillColor(NEGRO).text("TOTAL", totX, y + 4, { width: 150, align: "right" });
  doc.text(formatearMoneda(dec(c.importeTotal), c.moneda), totX + 155, y + 4, {
    width: 85,
    align: "right",
  });
  y += 30;

  if (!discrimina) {
    doc.font("Helvetica").fontSize(7).fillColor(GRIS);
    doc.text(
      letra === "C"
        ? "El IVA no se discrimina por tratarse de un comprobante clase C."
        : "El IVA se encuentra incluido en el precio (comprobante clase B).",
      X,
      y,
    );
    y += 14;
  }

  // ---- Pie con CAE + QR
  const pieY = Math.max(y + 10, 690);
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
    const png = await QRCode.toBuffer(url, { margin: 0, width: 200 });
    doc.image(png, X, pieY, { width: 78 });

    doc.font("Helvetica-Bold").fontSize(10).fillColor(NEGRO);
    doc.text(`CAE Nº: ${c.cae}`, X + 92, pieY + 14);
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    doc.text(`Fecha de vencimiento del CAE: ${fecha(c.caeVencimiento)}`, X + 92, pieY + 30);
    doc.fontSize(7).text(
      "Comprobante autorizado por ARCA. Verificable en www.afip.gob.ar mediante el código QR.",
      X + 92,
      pieY + 46,
    );
  } else {
    doc.rect(X, pieY, W, 40).fillAndStroke("#fef3c7", "#f59e0b");
    doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(11);
    doc.text("BORRADOR — SIN VALIDEZ FISCAL", X, pieY + 8, { width: W, align: "center" });
    doc.font("Helvetica").fontSize(8);
    doc.text("Este comprobante todavía no fue autorizado por ARCA.", X, pieY + 24, {
      width: W,
      align: "center",
    });
  }

  if (empresa.leyendaPie) {
    doc.fillColor(GRIS).font("Helvetica").fontSize(7);
    doc.text(empresa.leyendaPie, X, doc.page.height - 60, { width: W, align: "center" });
  }

  doc.end();
  return done;
}

export function nombreArchivoPdf(c: {
  tipo: keyof typeof NOMBRE_COMPROBANTE;
  ptoVta: number;
  numero: number | null;
  cliRazonSocial: string;
}): string {
  const limpio = c.cliRazonSocial.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
  return `${NOMBRE_COMPROBANTE[c.tipo].replace(/\s+/g, "-")}_${formatearNumero(
    c.ptoVta,
    c.numero,
  )}_${limpio}.pdf`;
}
