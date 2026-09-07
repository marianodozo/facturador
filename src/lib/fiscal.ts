import type { CondicionIVA, TipoComprobante, TipoDocumento } from "@prisma/client";

/**
 * Tablas y reglas fiscales de Argentina (ARCA / ex AFIP).
 * Códigos según los padrones de WSFEv1 (FEParamGetTiposCbte, TiposDoc, TiposIva)
 * y RG 5616 para la condición de IVA del receptor.
 */

// --- Tipos de comprobante -------------------------------------------------

export const CODIGO_COMPROBANTE: Record<TipoComprobante, number> = {
  FACTURA_A: 1,
  NOTA_DEBITO_A: 2,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_DEBITO_B: 7,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_DEBITO_C: 12,
  NOTA_CREDITO_C: 13,
  FACTURA_M: 51,
};

export const NOMBRE_COMPROBANTE: Record<TipoComprobante, string> = {
  FACTURA_A: "Factura A",
  FACTURA_B: "Factura B",
  FACTURA_C: "Factura C",
  FACTURA_M: "Factura M",
  NOTA_DEBITO_A: "Nota de Débito A",
  NOTA_DEBITO_B: "Nota de Débito B",
  NOTA_DEBITO_C: "Nota de Débito C",
  NOTA_CREDITO_A: "Nota de Crédito A",
  NOTA_CREDITO_B: "Nota de Crédito B",
  NOTA_CREDITO_C: "Nota de Crédito C",
};

/** Letra que se imprime en el recuadro del PDF. */
export function letraComprobante(tipo: TipoComprobante): string {
  if (tipo.endsWith("_A")) return "A";
  if (tipo.endsWith("_B")) return "B";
  if (tipo.endsWith("_M")) return "M";
  return "C";
}

export function esNotaCredito(tipo: TipoComprobante): boolean {
  return tipo.startsWith("NOTA_CREDITO");
}

export function esNotaDebito(tipo: TipoComprobante): boolean {
  return tipo.startsWith("NOTA_DEBITO");
}

/** En A y M el IVA se discrimina; en B y C va incluido en el precio. */
export function discriminaIVA(tipo: TipoComprobante): boolean {
  return tipo.endsWith("_A") || tipo.endsWith("_M");
}

/**
 * Los comprobantes clase C no llevan IVA en absoluto: ARCA espera
 * ImpNeto = ImpTotal, ImpIVA = 0 y el array de alícuotas vacío.
 */
export function esClaseC(tipo: TipoComprobante): boolean {
  return letraComprobante(tipo) === "C";
}

// --- Documentos -----------------------------------------------------------

export const CODIGO_DOCUMENTO: Record<TipoDocumento, number> = {
  CUIT: 80,
  CUIL: 86,
  CDI: 87,
  DNI: 96,
  PASAPORTE: 94,
  SIN_IDENTIFICAR: 99,
};

// --- Condición de IVA -----------------------------------------------------

export const NOMBRE_CONDICION_IVA: Record<CondicionIVA, string> = {
  RESPONSABLE_INSCRIPTO: "IVA Responsable Inscripto",
  MONOTRIBUTO: "Responsable Monotributo",
  MONOTRIBUTO_SOCIAL: "Monotributista Social",
  EXENTO: "IVA Sujeto Exento",
  CONSUMIDOR_FINAL: "Consumidor Final",
  NO_CATEGORIZADO: "Sujeto No Categorizado",
  IVA_LIBERADO: "IVA Liberado – Ley 19.640",
  NO_ALCANZADO: "IVA No Alcanzado",
};

/** CondicionIVAReceptorId exigido por RG 5616 en FECAESolicitar. */
export const CODIGO_CONDICION_IVA_RECEPTOR: Record<CondicionIVA, number> = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
  NO_CATEGORIZADO: 7,
  IVA_LIBERADO: 10,
  MONOTRIBUTO_SOCIAL: 13,
  NO_ALCANZADO: 15,
};

// --- Alícuotas de IVA -----------------------------------------------------

export const ALICUOTAS_IVA = [
  { id: 3, valor: 0, etiqueta: "0%" },
  { id: 9, valor: 2.5, etiqueta: "2,5%" },
  { id: 8, valor: 5, etiqueta: "5%" },
  { id: 4, valor: 10.5, etiqueta: "10,5%" },
  { id: 5, valor: 21, etiqueta: "21%" },
  { id: 6, valor: 27, etiqueta: "27%" },
] as const;

export function idAlicuota(valor: number): number {
  const found = ALICUOTAS_IVA.find((a) => Math.abs(a.valor - valor) < 0.001);
  if (!found) throw new Error(`Alícuota de IVA no soportada por ARCA: ${valor}%`);
  return found.id;
}

// --- Determinación del tipo de comprobante --------------------------------

export type ClaseComprobante = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO";

/**
 * Devuelve el tipo de comprobante que corresponde según la condición frente al
 * IVA del emisor y del receptor.
 *
 *  - Emisor Responsable Inscripto → A si el receptor es RI, si no B.
 *  - Emisor Monotributo o Exento → siempre C.
 */
export function determinarTipoComprobante(
  condicionEmisor: CondicionIVA,
  condicionReceptor: CondicionIVA,
  clase: ClaseComprobante = "FACTURA",
): TipoComprobante {
  let letra: "A" | "B" | "C";

  if (condicionEmisor === "RESPONSABLE_INSCRIPTO") {
    letra = condicionReceptor === "RESPONSABLE_INSCRIPTO" ? "A" : "B";
  } else {
    letra = "C";
  }

  const mapa: Record<ClaseComprobante, Record<"A" | "B" | "C", TipoComprobante>> = {
    FACTURA: { A: "FACTURA_A", B: "FACTURA_B", C: "FACTURA_C" },
    NOTA_CREDITO: {
      A: "NOTA_CREDITO_A",
      B: "NOTA_CREDITO_B",
      C: "NOTA_CREDITO_C",
    },
    NOTA_DEBITO: { A: "NOTA_DEBITO_A", B: "NOTA_DEBITO_B", C: "NOTA_DEBITO_C" },
  };

  return mapa[clase][letra];
}

/** La nota debe conservar la letra de la factura que corrige. */
export function tipoNotaPara(
  tipoFactura: TipoComprobante,
  clase: "NOTA_CREDITO" | "NOTA_DEBITO",
): TipoComprobante {
  const letra = letraComprobante(tipoFactura);
  if (letra === "A") return clase === "NOTA_CREDITO" ? "NOTA_CREDITO_A" : "NOTA_DEBITO_A";
  if (letra === "B") return clase === "NOTA_CREDITO" ? "NOTA_CREDITO_B" : "NOTA_DEBITO_B";
  return clase === "NOTA_CREDITO" ? "NOTA_CREDITO_C" : "NOTA_DEBITO_C";
}

// --- Cálculo de importes --------------------------------------------------

export function redondear(n: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export interface LineaCalculo {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  bonificacion?: number; // %
  alicuotaIVA: number; // 21, 10.5, 0...
}

export interface ItemCalculado extends LineaCalculo {
  importeNeto: number;
  importeIVA: number;
  importeTotal: number;
}

export interface TotalesComprobante {
  items: ItemCalculado[];
  lineasIVA: { alicuotaId: number; alicuota: number; baseImponible: number; importe: number }[];
  importeNeto: number;
  importeExento: number;
  importeNoGravado: number;
  importeIVA: number;
  importeTotal: number;
}

/**
 * Calcula netos, IVA y total.
 *
 * - A / M: el `precioUnitario` es neto y el IVA se suma.
 * - B: el precio ya es final; se desagrega el IVA sólo para informarlo a ARCA
 *   en los subtotales, pero el total que ve el cliente no cambia.
 * - C: no hay IVA. El precio es el total y ARCA espera ImpNeto = ImpTotal,
 *   ImpIVA = 0 y sin array de alícuotas.
 */
export function calcularTotales(
  lineas: LineaCalculo[],
  tipo: TipoComprobante,
): TotalesComprobante {
  if (esClaseC(tipo)) return calcularTotalesC(lineas);

  const discrimina = discriminaIVA(tipo);
  const items: ItemCalculado[] = [];
  const porAlicuota = new Map<number, { base: number; iva: number }>();

  let neto = 0;
  let exento = 0;
  let iva = 0;

  for (const l of lineas) {
    const bruto = l.cantidad * l.precioUnitario;
    const conBonif = bruto * (1 - (l.bonificacion ?? 0) / 100);

    let importeNeto: number;
    let importeIVA: number;

    if (discrimina) {
      importeNeto = redondear(conBonif);
      importeIVA = redondear(importeNeto * (l.alicuotaIVA / 100));
    } else {
      // El precio incluye IVA: se desagrega la base imponible.
      importeNeto = redondear(conBonif / (1 + l.alicuotaIVA / 100));
      importeIVA = redondear(conBonif - importeNeto);
    }

    const importeTotal = redondear(importeNeto + importeIVA);
    items.push({ ...l, importeNeto, importeIVA, importeTotal });

    if (l.alicuotaIVA === 0) {
      exento += importeNeto;
    } else {
      neto += importeNeto;
      iva += importeIVA;
    }

    const acc = porAlicuota.get(l.alicuotaIVA) ?? { base: 0, iva: 0 };
    acc.base += importeNeto;
    acc.iva += importeIVA;
    porAlicuota.set(l.alicuotaIVA, acc);
  }

  neto = redondear(neto);
  exento = redondear(exento);
  iva = redondear(iva);

  const lineasIVA = [...porAlicuota.entries()]
    .filter(([alic]) => alic > 0 || discrimina)
    .map(([alic, v]) => ({
      alicuotaId: idAlicuota(alic),
      alicuota: alic,
      baseImponible: redondear(v.base),
      importe: redondear(v.iva),
    }));

  return {
    items,
    lineasIVA,
    importeNeto: neto,
    importeExento: exento,
    importeNoGravado: 0,
    importeIVA: iva,
    importeTotal: redondear(neto + exento + iva),
  };
}

/** Comprobantes C: sin IVA, el importe de cada línea es directamente el neto. */
function calcularTotalesC(lineas: LineaCalculo[]): TotalesComprobante {
  const items: ItemCalculado[] = [];
  let total = 0;

  for (const l of lineas) {
    const importe = redondear(l.cantidad * l.precioUnitario * (1 - (l.bonificacion ?? 0) / 100));
    items.push({ ...l, alicuotaIVA: 0, importeNeto: importe, importeIVA: 0, importeTotal: importe });
    total += importe;
  }

  total = redondear(total);
  return {
    items,
    lineasIVA: [],
    importeNeto: total,
    importeExento: 0,
    importeNoGravado: 0,
    importeIVA: 0,
    importeTotal: total,
  };
}

// --- Utilidades -----------------------------------------------------------

/** Valida el dígito verificador de un CUIT/CUIL. */
export function validarCuit(cuit: string): boolean {
  const limpio = cuit.replace(/[^0-9]/g, "");
  if (limpio.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(limpio[i]), 0);
  const resto = suma % 11;
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return dv === Number(limpio[10]);
}

export function formatearCuit(cuit: string): string {
  const l = cuit.replace(/[^0-9]/g, "");
  if (l.length !== 11) return cuit;
  return `${l.slice(0, 2)}-${l.slice(2, 10)}-${l.slice(10)}`;
}

/** Número de comprobante en formato 0001-00000123 */
export function formatearNumero(ptoVta: number, numero: number | null): string {
  if (numero == null) return `${String(ptoVta).padStart(5, "0")}-(sin asignar)`;
  return `${String(ptoVta).padStart(5, "0")}-${String(numero).padStart(8, "0")}`;
}

export function formatearMoneda(n: number, moneda = "PES"): string {
  const simbolo = moneda === "DOL" ? "US$" : "$";
  return `${simbolo} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** yyyymmdd, el formato de fecha que espera WSFEv1. */
export function fechaArca(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function parseFechaArca(s: string): Date {
  return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
}
