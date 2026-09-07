"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria, requerirPermiso } from "@/lib/auth";
import { crearNotaCredito } from "@/lib/facturacion";
import { enviarComprobantePorEmail } from "@/lib/email";

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
