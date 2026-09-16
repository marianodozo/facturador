"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria, requerirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { crearNotaCredito, revisarComprobante } from "@/lib/facturacion";
import { enviarComprobantePorEmail } from "@/lib/email";

function aFecha(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  return s ? new Date(`${s}T00:00:00`) : null;
}

/**
 * Cambia las fechas de un comprobante que todavía no fue autorizado.
 *
 * Sirve para fechar hacia atrás, con el límite que impone ARCA: hasta 5 días
 * para productos y 10 para servicios, y nunca antes del último comprobante
 * autorizado del mismo tipo y punto de venta. El control previo vuelve a
 * correr para avisar si la fecha elegida queda fuera de rango.
 */
export async function actualizarFechas(formData: FormData) {
  const sesion = await requerirPermiso("comprobantes:escribir");
  const id = String(formData.get("comprobanteId"));

  const fechaEmision = aFecha(formData.get("fechaEmision"));
  if (!fechaEmision) throw new Error("Indicá la fecha de emisión");

  const c = await prisma.comprobante.findUniqueOrThrow({ where: { id } });
  if (c.estado === "AUTORIZADO") {
    throw new Error(
      "El comprobante ya tiene CAE: la fecha quedó registrada en ARCA y no se puede cambiar",
    );
  }

  const servicioDesde = aFecha(formData.get("servicioDesde"));
  const servicioHasta = aFecha(formData.get("servicioHasta"));
  if (servicioDesde && servicioHasta && servicioDesde > servicioHasta) {
    throw new Error("El período de servicio termina antes de empezar");
  }

  await prisma.comprobante.update({
    where: { id },
    data: {
      fechaEmision,
      fechaVtoPago: aFecha(formData.get("fechaVtoPago")),
      servicioDesde,
      servicioHasta,
    },
  });

  await revisarComprobante(id);
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "ACTUALIZAR",
    entidad: "Comprobante",
    entidadId: id,
    detalle: { fechaEmision: fechaEmision.toISOString().slice(0, 10) },
  });

  revalidatePath(`/comprobantes/${id}`);
  if (c.corridaId) revalidatePath(`/facturacion/${c.corridaId}`);
}

export async function enviarPorEmailAction(formData: FormData) {
  const sesion = await requerirPermiso("comprobantes:leer");
  const id = String(formData.get("comprobanteId"));
  const destino = String(formData.get("destino") ?? "").trim();

  const r = await enviarComprobantePorEmail(id, destino || undefined);

  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "EMAIL",
    entidad: "Comprobante",
    entidadId: id,
    detalle: { destino: r.destino },
  });

  revalidatePath(`/comprobantes/${id}`);
}

export async function crearNotaCreditoAction(formData: FormData) {
  const sesion = await requerirPermiso("comprobantes:escribir");
  const comprobanteId = String(formData.get("comprobanteId"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  const parcial = formData.get("importeParcial");

  if (!motivo) throw new Error("Indicá el motivo de la nota de crédito");

  const ncId = await crearNotaCredito(
    comprobanteId,
    sesion.sub,
    motivo,
    parcial ? Number(parcial) : undefined,
  );

  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "CREAR",
    entidad: "Comprobante",
    entidadId: ncId,
    detalle: { tipo: "NOTA_CREDITO", origen: comprobanteId, motivo },
  });

  revalidatePath("/comprobantes");
  redirect(`/comprobantes/${ncId}`);
}
