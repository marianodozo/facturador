import "server-only";
import { addDays } from "date-fns";
import type { EstadoComprobante, Prisma, TipoComprobante } from "@prisma/client";
import { prisma, dec } from "@/lib/db";
import {
  CODIGO_COMPROBANTE,
  CODIGO_CONDICION_IVA_RECEPTOR,
  CODIGO_DOCUMENTO,
  calcularTotales,
  determinarTipoComprobante,
  esNotaCredito,
  fechaArca,
  formatearNumero,
  letraComprobante,
  parseFechaArca,
  validarCuit,
  type LineaCalculo,
} from "@/lib/fiscal";
import {
  aplicarAjuste,
  calcularAjuste,
  periodoDe,
  periodoServicio,
  proximaFecha,
} from "@/lib/ajustes";
import { solicitarCAE, ultimoAutorizado } from "@/lib/arca/wsfev1";
import { ErrorArca } from "@/lib/arca/config";
import { enviarComprobantePorEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Generación de la corrida de facturación
// ---------------------------------------------------------------------------

export interface OpcionesCorrida {
  periodo: string; // "YYYY-MM"
  fechaEmision: Date;
  aplicarAjustes: boolean;
  clienteIds?: string[];
  descripcion?: string;
}

/**
 * Genera los comprobantes en BORRADOR de todos los servicios que vencen dentro
 * del período. No toca ARCA: la emisión es un paso posterior y explícito.
 */
export async function generarCorrida(opciones: OpcionesCorrida, usuarioId: string) {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });

  const hasta = new Date(
    opciones.fechaEmision.getFullYear(),
    opciones.fechaEmision.getMonth() + 1,
    0,
    23,
    59,
    59,
  );

  const servicios = await prisma.servicio.findMany({
    where: {
      activo: true,
      cliente: { activo: true, ...(opciones.clienteIds?.length ? { id: { in: opciones.clienteIds } } : {}) },
      fechaInicio: { lte: hasta },
      OR: [{ fechaFin: null }, { fechaFin: { gte: opciones.fechaEmision } }],
      proximaFacturacion: { lte: hasta },
    },
    include: { cliente: true },
    orderBy: [{ clienteId: "asc" }, { nombre: "asc" }],
  });

  if (!servicios.length) {
    throw new Error("No hay servicios con facturación pendiente para ese período");
  }

  const corrida = await prisma.corridaFacturacion.create({
    data: {
      periodo: opciones.periodo,
      descripcion: opciones.descripcion,
      fechaEmision: opciones.fechaEmision,
      estado: "EN_REVISION",
      creadoPorId: usuarioId,
    },
  });

  const ptoVta = await prisma.puntoVenta.findFirst({
    where: { numero: empresa.ptoVtaDefault, activo: true },
  });
  if (!ptoVta) throw new Error(`El punto de venta ${empresa.ptoVtaDefault} no está dado de alta`);

  // Un comprobante por cliente, agrupando todos sus servicios del período.
  const porCliente = new Map<string, typeof servicios>();
  for (const s of servicios) {
    porCliente.set(s.clienteId, [...(porCliente.get(s.clienteId) ?? []), s]);
  }

  let creados = 0;

  for (const [clienteId, lista] of porCliente) {
    const cliente = lista[0].cliente;

    // Ajustes antes de tomar el precio
    for (const s of lista) {
      if (!opciones.aplicarAjustes) continue;
      const r = await calcularAjuste(s, opciones.fechaEmision);
      if (r.aplica) {
        await aplicarAjuste(s.id, usuarioId, opciones.fechaEmision);
        s.precioActual = r.precioNuevo as never;
      }
    }

    const tipo = determinarTipoComprobante(empresa.condicionIVA, cliente.condicionIVA, "FACTURA");

    const lineas: LineaCalculo[] = lista.map((s) => ({
      descripcion: s.descripcion?.trim() || s.nombre,
      cantidad: dec(s.cantidad) || 1,
      precioUnitario: dec(s.precioActual),
      alicuotaIVA: dec(s.alicuotaIVA),
    }));

    const totales = calcularTotales(lineas, tipo);

    const rango = periodoServicio(
      opciones.fechaEmision,
      lista[0].periodicidadFacturacion,
      lista[0].facturaPorAdelantado,
    );
    const diasVto = lista[0].diasVencimiento || cliente.diasVencimiento || empresa.diasVtoPagoDefault;

    const comprobante = await prisma.comprobante.create({
      data: {
        tipo,
        estado: "BORRADOR",
        ptoVtaId: ptoVta.id,
        clienteId,
        corridaId: corrida.id,
        cliRazonSocial: cliente.razonSocial,
        cliTipoDoc: cliente.tipoDocumento,
        cliNroDoc: cliente.numeroDocumento,
        cliCondicionIVA: cliente.condicionIVA,
        cliDomicilio: [cliente.domicilio, cliente.localidad, cliente.provincia]
          .filter(Boolean)
          .join(", "),
        fechaEmision: opciones.fechaEmision,
        fechaVtoPago: addDays(opciones.fechaEmision, diasVto),
        concepto: empresa.conceptoDefault,
        servicioDesde: rango.desde,
        servicioHasta: rango.hasta,
        periodo: opciones.periodo,
        moneda: cliente.moneda,
        cotizacion: 1,
        importeNeto: totales.importeNeto,
        importeExento: totales.importeExento,
        importeNoGravado: totales.importeNoGravado,
        importeIVA: totales.importeIVA,
        importeTotal: totales.importeTotal,
        createdById: usuarioId,
        items: {
          create: totales.items.map((it, i) => ({
            servicioId: lista[i]?.id,
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            unidad: lista[i]?.unidad ?? "Unidad",
            precioUnitario: it.precioUnitario,
            alicuotaIVA: it.alicuotaIVA,
            importeNeto: it.importeNeto,
            importeIVA: it.importeIVA,
            importeTotal: it.importeTotal,
            orden: i,
          })),
        },
        lineasIVA: {
          create: totales.lineasIVA.map((l) => ({
            alicuotaId: l.alicuotaId,
            alicuota: l.alicuota,
            baseImponible: l.baseImponible,
            importe: l.importe,
          })),
        },
      },
    });

    await revisarComprobante(comprobante.id);
    creados++;
  }

  return { corridaId: corrida.id, comprobantes: creados };
}

// ---------------------------------------------------------------------------
// Control previo a la emisión
// ---------------------------------------------------------------------------

export type NivelValidacion = "ERROR" | "ADVERTENCIA";
export interface Validacion {
  nivel: NivelValidacion;
  mensaje: string;
}

const LIMITE_CONSUMIDOR_FINAL_SIN_IDENTIFICAR = 344_000; // RG vigente: identificar por encima de este monto

/**
 * Corre todas las validaciones del comprobante y guarda el resultado.
 * Un comprobante con ERROR no se puede enviar a ARCA.
 */
export async function revisarComprobante(comprobanteId: string): Promise<Validacion[]> {
  const c = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    include: {
      cliente: true,
      items: true,
      lineasIVA: true,
      puntoVenta: true,
      comprobanteAsociado: true,
    },
  });
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });

  const v: Validacion[] = [];
  const letra = letraComprobante(c.tipo);
  const total = dec(c.importeTotal);

  // --- Datos del emisor
  if (!empresa.arcaCertEncrypted || !empresa.arcaKeyEncrypted) {
    v.push({ nivel: "ERROR", mensaje: "Falta cargar el certificado de ARCA en Configuración" });
  }
  if (empresa.arcaCertVencimiento && empresa.arcaCertVencimiento < new Date()) {
    v.push({ nivel: "ERROR", mensaje: "El certificado de ARCA está vencido" });
  }
  if (!validarCuit(empresa.cuit)) {
    v.push({ nivel: "ERROR", mensaje: "El CUIT de la empresa es inválido" });
  }
  if (!c.puntoVenta.activo) {
    v.push({ nivel: "ERROR", mensaje: `El punto de venta ${c.puntoVenta.numero} está inactivo` });
  }

  // --- Datos del receptor
  if (letra === "A" && c.cliTipoDoc !== "CUIT") {
    v.push({ nivel: "ERROR", mensaje: "Una factura A exige CUIT del receptor" });
  }
  if (letra === "A" && c.cliCondicionIVA !== "RESPONSABLE_INSCRIPTO") {
    v.push({
      nivel: "ERROR",
      mensaje: "Se está emitiendo una factura A a un receptor que no es Responsable Inscripto",
    });
  }
  if (c.cliTipoDoc === "CUIT" && !validarCuit(c.cliNroDoc)) {
    v.push({ nivel: "ERROR", mensaje: `El CUIT del cliente (${c.cliNroDoc}) es inválido` });
  }
  if (
    c.cliCondicionIVA === "CONSUMIDOR_FINAL" &&
    c.cliTipoDoc === "SIN_IDENTIFICAR" &&
    total > LIMITE_CONSUMIDOR_FINAL_SIN_IDENTIFICAR
  ) {
    v.push({
      nivel: "ERROR",
      mensaje: "Por el monto, ARCA exige identificar al consumidor final",
    });
  }
  if (!c.cliente.emailFacturacion && !c.cliente.email) {
    v.push({ nivel: "ADVERTENCIA", mensaje: "El cliente no tiene email para enviarle la factura" });
  }

  // --- Importes
  if (!c.items.length) {
    v.push({ nivel: "ERROR", mensaje: "El comprobante no tiene ítems" });
  }
  if (total <= 0) {
    v.push({ nivel: "ERROR", mensaje: "El importe total debe ser mayor a cero" });
  }
  const sumaItems = c.items.reduce((a, i) => a + dec(i.importeTotal), 0);
  if (Math.abs(sumaItems - total) > 0.05) {
    v.push({
      nivel: "ERROR",
      mensaje: `El total (${total.toFixed(2)}) no coincide con la suma de los ítems (${sumaItems.toFixed(2)})`,
    });
  }
  const sumaIVA = c.lineasIVA.reduce((a, l) => a + dec(l.importe), 0);
  if (Math.abs(sumaIVA - dec(c.importeIVA)) > 0.05) {
    v.push({ nivel: "ERROR", mensaje: "Los subtotales de IVA no cierran con el IVA total" });
  }
  if (letra === "C") {
    if (dec(c.importeIVA) !== 0 || c.lineasIVA.length > 0) {
      v.push({ nivel: "ERROR", mensaje: "Un comprobante C no puede llevar IVA" });
    }
    if (Math.abs(dec(c.importeNeto) - total) > 0.05) {
      v.push({
        nivel: "ERROR",
        mensaje: "En un comprobante C el importe neto debe ser igual al total",
      });
    }
  }

  // --- Fechas
  const hoy = new Date();
  const diffDias = Math.abs((hoy.getTime() - c.fechaEmision.getTime()) / 86_400_000);
  const margen = c.concepto === 1 ? 5 : 10;
  if (diffDias > margen) {
    v.push({
      nivel: "ADVERTENCIA",
      mensaje: `La fecha de emisión está a ${Math.round(diffDias)} días de hoy; ARCA acepta hasta ${margen}`,
    });
  }
  if (c.concepto !== 1 && (!c.servicioDesde || !c.servicioHasta)) {
    v.push({ nivel: "ERROR", mensaje: "Falta el período de servicio (obligatorio para servicios)" });
  }

  // --- Notas de crédito / débito
  if (c.tipo.startsWith("NOTA_")) {
    if (!c.comprobanteAsociadoId) {
      v.push({ nivel: "ADVERTENCIA", mensaje: "La nota no tiene comprobante asociado" });
    } else if (c.comprobanteAsociado?.estado !== "AUTORIZADO") {
      v.push({ nivel: "ERROR", mensaje: "El comprobante asociado no está autorizado" });
    } else if (letraComprobante(c.comprobanteAsociado.tipo) !== letra) {
      v.push({ nivel: "ERROR", mensaje: "La nota debe tener la misma letra que la factura asociada" });
    } else if (esNotaCredito(c.tipo) && total > dec(c.comprobanteAsociado.importeTotal) + 0.01) {
      v.push({
        nivel: "ERROR",
        mensaje: "La nota de crédito supera el importe de la factura asociada",
      });
    }
    if (!c.motivoNota) {
      v.push({ nivel: "ADVERTENCIA", mensaje: "Conviene dejar asentado el motivo de la nota" });
    }
  }

  // --- Duplicados
  const duplicado = await prisma.comprobante.findFirst({
    where: {
      id: { not: c.id },
      clienteId: c.clienteId,
      periodo: c.periodo,
      tipo: c.tipo,
      estado: { in: ["AUTORIZADO", "APROBADO"] },
    },
  });
  if (duplicado) {
    v.push({
      nivel: "ADVERTENCIA",
      mensaje: `Ya existe un comprobante ${formatearNumero(
        c.puntoVenta.numero,
        duplicado.numero,
      )} para este cliente y período`,
    });
  }

  const estado: EstadoComprobante = v.some((x) => x.nivel === "ERROR") ? "OBSERVADO" : "BORRADOR";

  await prisma.comprobante.update({
    where: { id: c.id },
    data: { validaciones: v as never, revisadoAt: new Date(), estado: c.estado === "AUTORIZADO" ? c.estado : estado },
  });

  return v;
}

export async function aprobarComprobante(comprobanteId: string): Promise<void> {
  const v = await revisarComprobante(comprobanteId);
  if (v.some((x) => x.nivel === "ERROR")) {
    throw new Error("El comprobante tiene errores de validación y no se puede aprobar");
  }
  await prisma.comprobante.update({
    where: { id: comprobanteId },
    data: { estado: "APROBADO" },
  });
}

// ---------------------------------------------------------------------------
// Emisión contra ARCA
// ---------------------------------------------------------------------------

export interface ResultadoEmision {
  ok: boolean;
  comprobanteId: string;
  numero?: number;
  cae?: string;
  mensaje: string;
}

export async function emitirComprobante(
  comprobanteId: string,
  usuarioId: string,
): Promise<ResultadoEmision> {
  const c = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    include: { items: true, lineasIVA: true, puntoVenta: true, comprobanteAsociado: true },
  });

  if (c.estado === "AUTORIZADO") {
    return { ok: true, comprobanteId, numero: c.numero!, cae: c.cae!, mensaje: "Ya estaba autorizado" };
  }

  const validaciones = await revisarComprobante(comprobanteId);
  if (validaciones.some((v) => v.nivel === "ERROR")) {
    return {
      ok: false,
      comprobanteId,
      mensaje: `No pasó el control previo: ${validaciones
        .filter((v) => v.nivel === "ERROR")
        .map((v) => v.mensaje)
        .join(" · ")}`,
    };
  }

  const cbteTipo = CODIGO_COMPROBANTE[c.tipo];
  const ptoVta = c.puntoVenta.numero;

  try {
    const ultimo = await ultimoAutorizado(ptoVta, cbteTipo);
    const numero = ultimo + 1;

    const asociados =
      c.comprobanteAsociado && c.comprobanteAsociado.numero
        ? [
            {
              Tipo: CODIGO_COMPROBANTE[c.comprobanteAsociado.tipo],
              PtoVta: ptoVta,
              Nro: c.comprobanteAsociado.numero,
              CbteFch: fechaArca(c.comprobanteAsociado.fechaEmision),
            },
          ]
        : undefined;

    const respuesta = await solicitarCAE({
      ptoVta,
      cbteTipo,
      concepto: c.concepto,
      docTipo: CODIGO_DOCUMENTO[c.cliTipoDoc],
      docNro: c.cliNroDoc,
      cbteDesde: numero,
      cbteHasta: numero,
      cbteFch: fechaArca(c.fechaEmision),
      impTotal: dec(c.importeTotal),
      impTotConc: dec(c.importeNoGravado),
      impNeto: dec(c.importeNeto),
      impOpEx: dec(c.importeExento),
      impTrib: dec(c.importeTributos),
      impIVA: dec(c.importeIVA),
      fchServDesde: c.servicioDesde ? fechaArca(c.servicioDesde) : undefined,
      fchServHasta: c.servicioHasta ? fechaArca(c.servicioHasta) : undefined,
      fchVtoPago: c.fechaVtoPago ? fechaArca(c.fechaVtoPago) : undefined,
      monId: c.moneda,
      monCotiz: dec(c.cotizacion) || 1,
      condicionIVAReceptorId: CODIGO_CONDICION_IVA_RECEPTOR[c.cliCondicionIVA],
      iva: c.lineasIVA.map((l) => ({
        Id: l.alicuotaId,
        BaseImp: dec(l.baseImponible),
        Importe: dec(l.importe),
      })),
      cbtesAsoc: asociados,
    });

    if (respuesta.resultado === "R" || !respuesta.cae) {
      await prisma.comprobante.update({
        where: { id: comprobanteId },
        data: {
          estado: "RECHAZADO",
          resultadoArca: respuesta.resultado,
          observaciones: respuesta.observaciones as never,
          enviadoAt: new Date(),
        },
      });
      return {
        ok: false,
        comprobanteId,
        mensaje: `ARCA rechazó el comprobante: ${respuesta.observaciones
          .map((o) => `[${o.codigo}] ${o.mensaje}`)
          .join(" | ")}`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.comprobante.update({
        where: { id: comprobanteId },
        data: {
          estado: "AUTORIZADO",
          numero: respuesta.numero ?? numero,
          cae: respuesta.cae,
          caeVencimiento: respuesta.caeVencimiento
            ? parseFechaArca(respuesta.caeVencimiento)
            : null,
          resultadoArca: respuesta.resultado,
          observaciones: respuesta.observaciones as never,
          enviadoAt: new Date(),
          autorizadoAt: new Date(),
          autorizadoById: usuarioId,
        },
      });

      // Avanzar la próxima facturación de los servicios incluidos
      const servicioIds = c.items.map((i) => i.servicioId).filter(Boolean) as string[];
      for (const sid of servicioIds) {
        const s = await tx.servicio.findUnique({ where: { id: sid } });
        if (!s) continue;
        await tx.servicio.update({
          where: { id: sid },
          data: {
            ultimaFacturacion: c.fechaEmision,
            proximaFacturacion: proximaFecha(
              s.proximaFacturacion,
              s.periodicidadFacturacion,
              s.diaFacturacion,
            ),
          },
        });
      }

      if (esNotaCredito(c.tipo) && c.comprobanteAsociadoId) {
        await tx.comprobante.update({
          where: { id: c.comprobanteAsociadoId },
          data: { estado: "ANULADO" },
        });
      }
    });

    // Envío automático del PDF al cliente, si está habilitado.
    const empresa = await prisma.empresa.findUnique({ where: { id: 1 } });
    if (empresa?.enviarEmailAuto) {
      try {
        await enviarComprobantePorEmail(comprobanteId);
      } catch {
        // El error queda registrado en el comprobante; la emisión no se revierte.
      }
    }

    return {
      ok: true,
      comprobanteId,
      numero: respuesta.numero ?? numero,
      cae: respuesta.cae,
      mensaje:
        respuesta.observaciones.length > 0
          ? `Autorizado con observaciones: ${respuesta.observaciones.map((o) => o.mensaje).join(" | ")}`
          : "Autorizado",
    };
  } catch (e) {
    const mensaje = e instanceof ErrorArca ? e.message : e instanceof Error ? e.message : String(e);
    await prisma.comprobante.update({
      where: { id: comprobanteId },
      data: { estado: "RECHAZADO", errores: [{ mensaje }] as never, enviadoAt: new Date() },
    });
    return { ok: false, comprobanteId, mensaje };
  }
}

/** Emite todos los comprobantes aprobados de una corrida, uno por uno. */
export async function emitirCorrida(corridaId: string, usuarioId: string) {
  const comprobantes = await prisma.comprobante.findMany({
    where: { corridaId, estado: { in: ["APROBADO", "BORRADOR", "RECHAZADO"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const resultados: ResultadoEmision[] = [];
  for (const c of comprobantes) {
    resultados.push(await emitirComprobante(c.id, usuarioId));
  }

  const fallidos = resultados.filter((r) => !r.ok).length;
  await prisma.corridaFacturacion.update({
    where: { id: corridaId },
    data: { estado: fallidos === resultados.length && resultados.length > 0 ? "EN_REVISION" : "EMITIDA" },
  });

  return {
    total: resultados.length,
    autorizados: resultados.length - fallidos,
    fallidos,
    resultados,
  };
}

/** Crea la nota de crédito que anula una factura autorizada. */
export async function crearNotaCredito(
  comprobanteId: string,
  usuarioId: string,
  motivo: string,
  importeParcial?: number,
): Promise<string> {
  const original = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    include: { items: true, lineasIVA: true },
  });
  if (original.estado !== "AUTORIZADO") {
    throw new Error("Sólo se pueden acreditar comprobantes autorizados");
  }

  const tipo = (
    {
      A: "NOTA_CREDITO_A",
      B: "NOTA_CREDITO_B",
      C: "NOTA_CREDITO_C",
      M: "NOTA_CREDITO_A",
    } as Record<string, TipoComprobante>
  )[letraComprobante(original.tipo)];

  const proporcion = importeParcial
    ? importeParcial / dec(original.importeTotal)
    : 1;

  const lineas: LineaCalculo[] = original.items.map((i) => ({
    descripcion: i.descripcion,
    cantidad: dec(i.cantidad),
    precioUnitario: dec(i.precioUnitario) * proporcion,
    alicuotaIVA: dec(i.alicuotaIVA),
  }));
  const totales = calcularTotales(lineas, tipo);

  const nc = await prisma.comprobante.create({
    data: {
      tipo,
      estado: "BORRADOR",
      ptoVtaId: original.ptoVtaId,
      clienteId: original.clienteId,
      cliRazonSocial: original.cliRazonSocial,
      cliTipoDoc: original.cliTipoDoc,
      cliNroDoc: original.cliNroDoc,
      cliCondicionIVA: original.cliCondicionIVA,
      cliDomicilio: original.cliDomicilio,
      fechaEmision: new Date(),
      concepto: original.concepto,
      servicioDesde: original.servicioDesde,
      servicioHasta: original.servicioHasta,
      periodo: original.periodo,
      moneda: original.moneda,
      cotizacion: original.cotizacion,
      importeNeto: totales.importeNeto,
      importeExento: totales.importeExento,
      importeIVA: totales.importeIVA,
      importeTotal: totales.importeTotal,
      comprobanteAsociadoId: original.id,
      motivoNota: motivo,
      createdById: usuarioId,
      items: {
        create: totales.items.map((it, i) => ({
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
          alicuotaIVA: it.alicuotaIVA,
          importeNeto: it.importeNeto,
          importeIVA: it.importeIVA,
          importeTotal: it.importeTotal,
          orden: i,
        })),
      },
      lineasIVA: {
        create: totales.lineasIVA.map((l) => ({
          alicuotaId: l.alicuotaId,
          alicuota: l.alicuota,
          baseImponible: l.baseImponible,
          importe: l.importe,
        })),
      },
    },
  });

  await revisarComprobante(nc.id);
  return nc.id;
}

export const incluirComprobanteCompleto = {
  cliente: true,
  items: { orderBy: { orden: "asc" } },
  lineasIVA: true,
  puntoVenta: true,
  comprobanteAsociado: true,
  createdBy: { select: { nombre: true } },
} satisfies Prisma.ComprobanteInclude;

export { periodoDe };
