import "server-only";
import { addMonths, startOfMonth } from "date-fns";
import { prisma, dec } from "@/lib/db";
import { MESES_POR_PERIODICIDAD, periodoDe } from "@/lib/ajustes";

export interface Kpis {
  periodo: string;
  facturadoMes: number;
  facturadoMesAnterior: number;
  variacionMensual: number | null;
  ivaDebito: number;
  comprobantesEmitidos: number;
  comprobantesRechazados: number;
  tasaRechazo: number;
  ticketPromedio: number;
  mrr: number;
  arr: number;
  clientesActivos: number;
  clientesFacturadosMes: number;
  serviciosActivos: number;
  pendientesDeEmitir: number;
  importePendiente: number;
  serviciosPorFacturar: number;
  ajustesPendientes: number;
  certificadoVenceEnDias: number | null;
  serie: { periodo: string; total: number; comprobantes: number }[];
  topClientes: { id: string; razonSocial: string; total: number }[];
  porTipo: { tipo: string; cantidad: number; total: number }[];
}

export async function calcularKpis(referencia: Date = new Date()): Promise<Kpis> {
  const inicioMes = startOfMonth(referencia);
  const finMes = addMonths(inicioMes, 1);
  const inicioMesAnterior = addMonths(inicioMes, -1);

  const autorizadas = { estado: "AUTORIZADO" as const };

  const [
    delMes,
    delMesAnterior,
    rechazados,
    pendientes,
    clientesActivos,
    servicios,
    empresa,
    ajustesPendientes,
    serviciosPorFacturar,
  ] = await Promise.all([
    prisma.comprobante.findMany({
      where: { ...autorizadas, fechaEmision: { gte: inicioMes, lt: finMes } },
      select: {
        clienteId: true,
        tipo: true,
        importeTotal: true,
        importeIVA: true,
        cliRazonSocial: true,
      },
    }),
    prisma.comprobante.aggregate({
      where: { ...autorizadas, fechaEmision: { gte: inicioMesAnterior, lt: inicioMes } },
      _sum: { importeTotal: true },
    }),
    prisma.comprobante.count({
      where: { estado: "RECHAZADO", updatedAt: { gte: inicioMes, lt: finMes } },
    }),
    prisma.comprobante.aggregate({
      where: { estado: { in: ["BORRADOR", "OBSERVADO", "APROBADO"] } },
      _count: true,
      _sum: { importeTotal: true },
    }),
    prisma.cliente.count({ where: { activo: true } }),
    prisma.servicio.findMany({
      where: { activo: true },
      select: { precioActual: true, periodicidadFacturacion: true, cantidad: true },
    }),
    prisma.empresa.findUnique({ where: { id: 1 } }),
    prisma.servicio.count({
      where: {
        activo: true,
        tipoAjuste: { not: "NINGUNO" },
        proximoAjuste: { lte: referencia },
      },
    }),
    prisma.servicio.count({
      where: { activo: true, proximaFacturacion: { lt: finMes } },
    }),
  ]);

  const facturadoMes = delMes.reduce((a, c) => a + dec(c.importeTotal), 0);
  const facturadoMesAnterior = dec(delMesAnterior._sum.importeTotal);
  const ivaDebito = delMes.reduce((a, c) => a + dec(c.importeIVA), 0);

  const signo = (t: string) => (t.startsWith("NOTA_CREDITO") ? -1 : 1);
  const netoMes = delMes.reduce((a, c) => a + signo(c.tipo) * dec(c.importeTotal), 0);

  // MRR: precio de cada servicio activo llevado a base mensual
  const mrr = servicios.reduce((a, s) => {
    const meses = MESES_POR_PERIODICIDAD[s.periodicidadFacturacion];
    if (!meses) return a;
    return a + (dec(s.precioActual) * (dec(s.cantidad) || 1)) / meses;
  }, 0);

  // Serie de los últimos 12 meses
  const desdeSerie = startOfMonth(addMonths(referencia, -11));
  const historico = await prisma.comprobante.findMany({
    where: { ...autorizadas, fechaEmision: { gte: desdeSerie, lt: finMes } },
    select: { fechaEmision: true, importeTotal: true, tipo: true },
  });
  const mapaSerie = new Map<string, { total: number; comprobantes: number }>();
  for (let i = 0; i < 12; i++) {
    mapaSerie.set(periodoDe(addMonths(desdeSerie, i)), { total: 0, comprobantes: 0 });
  }
  for (const h of historico) {
    const k = periodoDe(h.fechaEmision);
    const acc = mapaSerie.get(k);
    if (!acc) continue;
    acc.total += signo(h.tipo) * dec(h.importeTotal);
    acc.comprobantes += 1;
  }

  // Top clientes del mes
  const mapaClientes = new Map<string, { razonSocial: string; total: number }>();
  for (const c of delMes) {
    const acc = mapaClientes.get(c.clienteId) ?? { razonSocial: c.cliRazonSocial, total: 0 };
    acc.total += signo(c.tipo) * dec(c.importeTotal);
    mapaClientes.set(c.clienteId, acc);
  }

  const mapaTipos = new Map<string, { cantidad: number; total: number }>();
  for (const c of delMes) {
    const acc = mapaTipos.get(c.tipo) ?? { cantidad: 0, total: 0 };
    acc.cantidad += 1;
    acc.total += dec(c.importeTotal);
    mapaTipos.set(c.tipo, acc);
  }

  const emitidos = delMes.length;

  return {
    periodo: periodoDe(referencia),
    facturadoMes: netoMes,
    facturadoMesAnterior,
    variacionMensual:
      facturadoMesAnterior > 0 ? ((netoMes - facturadoMesAnterior) / facturadoMesAnterior) * 100 : null,
    ivaDebito,
    comprobantesEmitidos: emitidos,
    comprobantesRechazados: rechazados,
    tasaRechazo: emitidos + rechazados > 0 ? (rechazados / (emitidos + rechazados)) * 100 : 0,
    ticketPromedio: emitidos > 0 ? facturadoMes / emitidos : 0,
    mrr,
    arr: mrr * 12,
    clientesActivos,
    clientesFacturadosMes: mapaClientes.size,
    serviciosActivos: servicios.length,
    pendientesDeEmitir: pendientes._count,
    importePendiente: dec(pendientes._sum.importeTotal),
    serviciosPorFacturar,
    ajustesPendientes,
    certificadoVenceEnDias: empresa?.arcaCertVencimiento
      ? Math.ceil((empresa.arcaCertVencimiento.getTime() - Date.now()) / 86_400_000)
      : null,
    serie: [...mapaSerie.entries()].map(([periodo, v]) => ({ periodo, ...v })),
    topClientes: [...mapaClientes.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    porTipo: [...mapaTipos.entries()]
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}
