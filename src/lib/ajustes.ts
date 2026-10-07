import { addMonths, startOfMonth } from "date-fns";
import type { Periodicidad } from "@prisma/client";
import { prisma, dec } from "@/lib/db";
import { redondear } from "@/lib/fiscal";

/** Motor de ajuste de precios por índice o por porcentaje fijo. */

export const MESES_POR_PERIODICIDAD: Record<Periodicidad, number> = {
  MENSUAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  CUATRIMESTRAL: 4,
  SEMESTRAL: 6,
  ANUAL: 12,
  UNICA: 0,
};

export const NOMBRE_PERIODICIDAD: Record<Periodicidad, string> = {
  MENSUAL: "Mensual",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  CUATRIMESTRAL: "Cuatrimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
  UNICA: "Única vez",
};

export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export function fechaDePeriodo(periodo: string): Date {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

export function siguientePeriodo(periodo: string, meses = 1): string {
  return periodoDe(addMonths(fechaDePeriodo(periodo), meses));
}

/** Avanza una fecha según la periodicidad, respetando el día de facturación. */
export function proximaFecha(desde: Date, periodicidad: Periodicidad, dia?: number): Date {
  const meses = MESES_POR_PERIODICIDAD[periodicidad];
  if (meses === 0) return desde;
  const base = addMonths(desde, meses);
  if (!dia) return base;
  const ultimoDiaDelMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return new Date(base.getFullYear(), base.getMonth(), Math.min(dia, ultimoDiaDelMes));
}

/** Último instante del período `AAAA-MM`. */
export function finDePeriodo(periodo: string): Date {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(y, m ?? 1, 0, 23, 59, 59);
}

/**
 * Próxima facturación de un servicio después de facturar un período.
 *
 * Avanza hasta superar el fin del período facturado, no un solo paso: un
 * servicio atrasado —o uno que ajusta cada varios meses y se facturó tarde—
 * quedaría otra vez vencido y volvería a aparecer como borrador en la corrida
 * siguiente, que es de donde salían las facturas duplicadas.
 *
 * Devuelve `null` para los servicios de única vez: esos no se vuelven a
 * facturar y el llamador los desactiva.
 */
export function proximaTrasPeriodo(
  proximaActual: Date,
  periodicidad: Periodicidad,
  finPeriodo: Date,
  dia?: number | null,
): Date | null {
  if (MESES_POR_PERIODICIDAD[periodicidad] === 0) return null;

  let prox = proximaFecha(proximaActual, periodicidad, dia ?? undefined);
  // El tope evita un bucle infinito si alguna fecha quedara inconsistente
  for (let i = 0; prox <= finPeriodo && i < 240; i++) {
    prox = proximaFecha(prox, periodicidad, dia ?? undefined);
  }
  return prox;
}

export interface ResultadoAjuste {
  aplica: boolean;
  motivo: string;
  precioAnterior: number;
  precioNuevo: number;
  coeficiente: number;
  origen: "INDICE" | "PORCENTAJE_FIJO" | "MANUAL";
  periodoDesde?: string;
  periodoHasta?: string;
  indiceCodigo?: string;
}

type ServicioAjuste = {
  id: string;
  precioActual: unknown;
  tipoAjuste: string;
  indiceId: string | null;
  ajustePorcentaje: unknown;
  periodoBaseIndice: string | null;
  proximoAjuste: Date | null;
  topeAjustePorc: unknown;
  periodicidadAjuste: Periodicidad | null;
};

/**
 * Calcula el ajuste que corresponde a un servicio a una fecha dada.
 * No persiste nada: se usa tanto en el control previo (para mostrarlo) como
 * al aplicar el ajuste de verdad.
 */
export async function calcularAjuste(
  servicio: ServicioAjuste,
  aFecha: Date = new Date(),
): Promise<ResultadoAjuste> {
  const precioAnterior = dec(servicio.precioActual);
  const base: ResultadoAjuste = {
    aplica: false,
    motivo: "",
    precioAnterior,
    precioNuevo: precioAnterior,
    coeficiente: 1,
    origen: "MANUAL",
  };

  if (servicio.tipoAjuste === "NINGUNO") {
    return { ...base, motivo: "El servicio no tiene ajuste configurado" };
  }
  if (servicio.proximoAjuste && servicio.proximoAjuste > aFecha) {
    return {
      ...base,
      motivo: `El próximo ajuste es el ${servicio.proximoAjuste.toLocaleDateString("es-AR")}`,
    };
  }

  if (servicio.tipoAjuste === "PORCENTAJE_FIJO") {
    const porc = dec(servicio.ajustePorcentaje);
    if (!porc) return { ...base, motivo: "No se cargó el porcentaje de ajuste" };
    const coef = 1 + porc / 100;
    return {
      aplica: true,
      motivo: `Ajuste fijo del ${porc}%`,
      precioAnterior,
      precioNuevo: redondear(precioAnterior * coef),
      coeficiente: redondear(coef, 6),
      origen: "PORCENTAJE_FIJO",
    };
  }

  // Ajuste por índice
  if (!servicio.indiceId) return { ...base, motivo: "El servicio no tiene índice asignado" };

  const indice = await prisma.indice.findUnique({
    where: { id: servicio.indiceId },
    include: { valores: { orderBy: { periodo: "asc" } } },
  });
  if (!indice) return { ...base, motivo: "El índice configurado no existe" };

  const periodoBase = servicio.periodoBaseIndice;
  if (!periodoBase) return { ...base, motivo: "Falta definir el período base del índice" };

  const valorBase = indice.valores.find((v) => v.periodo === periodoBase);
  if (!valorBase) {
    return { ...base, motivo: `No hay valor de ${indice.codigo} para el período base ${periodoBase}` };
  }

  // Último período con valor cargado que no supere la fecha de cálculo.
  const periodoTope = periodoDe(aFecha);
  const disponibles = indice.valores.filter((v) => v.periodo <= periodoTope && v.periodo > periodoBase);
  const ultimo = disponibles.at(-1);

  if (!ultimo) {
    return {
      ...base,
      motivo: `Todavía no hay valores de ${indice.codigo} posteriores a ${periodoBase}`,
    };
  }

  let coef = dec(ultimo.valor) / dec(valorBase.valor);
  const tope = dec(servicio.topeAjustePorc);
  let motivo = `${indice.codigo} ${periodoBase} → ${ultimo.periodo} (${redondear((coef - 1) * 100, 2)}%)`;

  if (tope > 0 && (coef - 1) * 100 > tope) {
    coef = 1 + tope / 100;
    motivo += ` — limitado al tope del ${tope}%`;
  }

  return {
    aplica: true,
    motivo,
    precioAnterior,
    precioNuevo: redondear(precioAnterior * coef),
    coeficiente: redondear(coef, 6),
    origen: "INDICE",
    periodoDesde: periodoBase,
    periodoHasta: ultimo.periodo,
    indiceCodigo: indice.codigo,
  };
}

/** Aplica el ajuste y deja registro en el historial. */
export async function aplicarAjuste(
  servicioId: string,
  usuarioId: string | null,
  aFecha: Date = new Date(),
): Promise<ResultadoAjuste> {
  const servicio = await prisma.servicio.findUniqueOrThrow({ where: { id: servicioId } });
  const r = await calcularAjuste(servicio, aFecha);
  if (!r.aplica) return r;

  await prisma.$transaction([
    prisma.servicio.update({
      where: { id: servicioId },
      data: {
        precioActual: r.precioNuevo,
        ultimoAjuste: aFecha,
        periodoBaseIndice: r.periodoHasta ?? servicio.periodoBaseIndice,
        proximoAjuste: servicio.periodicidadAjuste
          ? proximaFecha(aFecha, servicio.periodicidadAjuste)
          : null,
      },
    }),
    prisma.ajusteServicio.create({
      data: {
        servicioId,
        fecha: aFecha,
        precioAnterior: r.precioAnterior,
        precioNuevo: r.precioNuevo,
        coeficiente: r.coeficiente,
        origen: r.origen,
        indiceCodigo: r.indiceCodigo,
        periodoDesde: r.periodoDesde,
        periodoHasta: r.periodoHasta,
        motivo: r.motivo,
        usuarioId,
      },
    }),
  ]);

  return r;
}

/** Servicios con ajuste vencido a la fecha indicada. */
export async function serviciosConAjustePendiente(aFecha: Date = new Date()) {
  return prisma.servicio.findMany({
    where: {
      activo: true,
      tipoAjuste: { not: "NINGUNO" },
      OR: [{ proximoAjuste: { lte: aFecha } }, { proximoAjuste: null }],
    },
    include: { cliente: true, indice: true },
    orderBy: { proximoAjuste: "asc" },
  });
}

/** Período de servicio que cubre una factura emitida en `fecha`. */
export function periodoServicio(
  fecha: Date,
  periodicidad: Periodicidad,
  porAdelantado: boolean,
): { desde: Date; hasta: Date } {
  const meses = Math.max(MESES_POR_PERIODICIDAD[periodicidad], 1);
  const inicio = porAdelantado
    ? startOfMonth(fecha)
    : startOfMonth(addMonths(fecha, -meses));
  const fin = new Date(
    addMonths(inicio, meses).getFullYear(),
    addMonths(inicio, meses).getMonth(),
    0,
  );
  return { desde: inicio, hasta: fin };
}
