import fs from "node:fs";
import { construirPdf, type DatosPdf } from "@/lib/pdf-plantilla";

const logo = fs.readFileSync(process.env.LOGO ?? "/tmp/logo.png").toString("base64");

const base = (tipo: DatosPdf["comprobante"]["tipo"], conCae: boolean): DatosPdf => ({
  empresa: {
    razonSocial: "MACAFLEX SA",
    cuit: "30716706784",
    condicionIVA: "RESPONSABLE_INSCRIPTO",
    domicilio: "SOLER 5731 6C",
    localidad: "CABA",
    ingresosBrutos: "901-123456-7",
    inicioActividades: new Date(2018, 2, 15),
    leyendaPie: "Gracias por su confianza.",
    logoBase64: logo,
  },
  comprobante: {
    tipo,
    numero: conCae ? 374 : null,
    fechaEmision: new Date(2026, 6, 13),
    fechaVtoPago: new Date(2026, 7, 12),
    servicioDesde: new Date(2026, 6, 1),
    servicioHasta: new Date(2026, 6, 31),
    moneda: "PES",
    cotizacion: 1,
    importeNeto: 3000000,
    importeExento: 0,
    importeTotal: tipo === "FACTURA_A" ? 3630000 : 3000000,
    cae: conCae ? "86283631420599" : null,
    caeVencimiento: conCae ? new Date(2026, 6, 23) : null,
    motivoNota: null,
    cliRazonSocial: "MUSUX SRL",
    cliTipoDoc: "CUIT",
    cliNroDoc: "30718964624",
    cliCondicionIVA: "RESPONSABLE_INSCRIPTO",
    cliDomicilio: "TRIUNVIRATO AV. 2766 PISO:6 DPTO:A",
    cliLocalidad: "CABA",
    cliProvincia: "CIUDAD AUTONOMA DE BUENOS AIRES",
    cliEmail: "administracion@musux.com.ar",
    cliCondicionPago: "30 días fecha factura",
    puntoVenta: { numero: 2, descripcion: "CASA CENTRAL" },
    cliente: {
      email: null,
      emailFacturacion: null,
      localidad: null,
      provincia: null,
      condicionPago: null,
    },
    items: [
      {
        descripcion: "#P00034 — Servicio de mantenimiento mensual de equipamiento",
        cantidad: 1,
        precioUnitario: 3000000,
        alicuotaIVA: 21,
        importeNeto: 3000000,
        importeTotal: 3630000,
      },
    ],
    lineasIVA: [{ alicuota: 21, importe: 630000 }],
    comprobanteAsociado: null,
  },
});

// Caso con varios ítems y dos alícuotas, para ver cómo se comporta la tabla
const variado = base("FACTURA_A", true);
variado.comprobante.items = [
  { descripcion: "Abono mensual de soporte — plan Premium", cantidad: 1, precioUnitario: 1850000, alicuotaIVA: 21, importeNeto: 1850000, importeTotal: 2238500 },
  { descripcion: "Horas adicionales de consultoría fuera de horario, según orden de compra OC-2026-114 del 2 de julio", cantidad: 12, precioUnitario: 74000, alicuotaIVA: 21, importeNeto: 888000, importeTotal: 1074480 },
  { descripcion: "Traslado e instalación en sede Vicente López", cantidad: 2, precioUnitario: 131000, alicuotaIVA: 10.5, importeNeto: 262000, importeTotal: 289510 },
];
variado.comprobante.importeNeto = 3000000;
variado.comprobante.importeTotal = 3602490;
variado.comprobante.lineasIVA = [
  { alicuota: 21, importe: 574980 },
  { alicuota: 10.5, importe: 27510 },
];

const casos: [string, DatosPdf][] = [
  ["a-autorizada", base("FACTURA_A", true)],
  ["b-borrador", base("FACTURA_B", false)],
  ["c-monotributo", base("FACTURA_C", true)],
  ["a-varios-items", variado],
];

async function main() {
  for (const [nombre, datos] of casos) {
    const pdf = await construirPdf(datos);
    fs.writeFileSync(`/tmp/muestra-${nombre}.pdf`, pdf);
    console.log(`/tmp/muestra-${nombre}.pdf — ${(pdf.length / 1024).toFixed(1)} KB`);
  }
}
main();
