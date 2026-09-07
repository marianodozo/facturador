"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { registrarAuditoria, requerirPermiso } from "@/lib/auth";
import {
  aprobarComprobante,
  emitirComprobante,
  emitirCorrida,
  generarCorrida,
  revisarComprobante,
} from "@/lib/facturacion";

export type EstadoForm = { error?: string; ok?: string };

export async function crearCorrida(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sesion = await requerirPermiso("comprobantes:escribir");

  const periodo = String(formData.get("periodo") ?? "");
  const fechaEmision = String(formData.get("fechaEmision") ?? "");
  const aplicarAjustes = formData.get("aplicarAjustes") === "on";
  const descripcion = String(formData.get("descripcion") ?? "");

  if (!/^\d{4}-\d{2}$/.test(periodo)) return { error: "El período debe tener el formato AAAA-MM" };
  if (!fechaEmision) return { error: "Indicá la fecha de emisión" };

  let corridaId: string;
  try {
    const r = await generarCorrida(
      {
        periodo,
        fechaEmision: new Date(`${fechaEmision}T00:00:00`),
        aplicarAjustes,
        descripcion: descripcion || undefined,
      },
      sesion.sub,
    );
    corridaId = r.corridaId;
    await registrarAuditoria({
      usuarioId: sesion.sub,
      accion: "CREAR",
      entidad: "Corrida",
      entidadId: corridaId,
      detalle: { periodo, comprobantes: r.comprobantes },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  redirect(`/facturacion/${corridaId}`);
}

export async function revisarTodo(formData: FormData) {
  await requerirPermiso("comprobantes:escribir");
  const corridaId = String(formData.get("corridaId"));
  const comprobantes = await prisma.comprobante.findMany({
    where: { corridaId, estado: { in: ["BORRADOR", "OBSERVADO", "APROBADO"] } },
    select: { id: true },
  });
  for (const c of comprobantes) await revisarComprobante(c.id);
  revalidatePath(`/facturacion/${corridaId}`);
}

export async function aprobarTodo(formData: FormData) {
  await requerirPermiso("comprobantes:escribir");
  const corridaId = String(formData.get("corridaId"));
  const comprobantes = await prisma.comprobante.findMany({
    where: { corridaId, estado: { in: ["BORRADOR", "OBSERVADO"] } },
    select: { id: true },
  });
  for (const c of comprobantes) {
    try {
      await aprobarComprobante(c.id);
    } catch {
      // los que tienen errores quedan observados
    }
  }
  revalidatePath(`/facturacion/${corridaId}`);
}

export async function emitirCorridaAction(formData: FormData) {
  const sesion = await requerirPermiso("comprobantes:emitir");
  const corridaId = String(formData.get("corridaId"));

  const pendientes = await prisma.comprobante.count({
    where: { corridaId, estado: { in: ["BORRADOR", "OBSERVADO"] } },
  });
  if (pendientes > 0) {
    throw new Error(
      `Hay ${pendientes} comprobantes sin aprobar. Revisá el control previo antes de emitir.`,
    );
  }

  const r = await emitirCorrida(corridaId, sesion.sub);
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "EMITIR",
    entidad: "Corrida",
    entidadId: corridaId,
    detalle: r,
  });

  revalidatePath(`/facturacion/${corridaId}`);
  revalidatePath("/comprobantes");
}

export async function emitirUno(formData: FormData) {
  const sesion = await requerirPermiso("comprobantes:emitir");
  const id = String(formData.get("comprobanteId"));
  const r = await emitirComprobante(id, sesion.sub);
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "EMITIR",
    entidad: "Comprobante",
    entidadId: id,
    detalle: r,
  });
  revalidatePath(`/comprobantes/${id}`);
  revalidatePath("/facturacion");
}

export async function aprobarUno(formData: FormData) {
  await requerirPermiso("comprobantes:escribir");
  const id = String(formData.get("comprobanteId"));
  await aprobarComprobante(id);
  revalidatePath(`/comprobantes/${id}`);
  revalidatePath("/facturacion");
}

export async function descartarComprobante(formData: FormData) {
  const sesion = await requerirPermiso("comprobantes:escribir");
  const id = String(formData.get("comprobanteId"));
  const c = await prisma.comprobante.findUniqueOrThrow({ where: { id } });
  if (c.estado === "AUTORIZADO") {
    throw new Error("Un comprobante autorizado no se descarta: se anula con una nota de crédito");
  }
  await prisma.comprobante.delete({ where: { id } });
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "ELIMINAR",
    entidad: "Comprobante",
    entidadId: id,
  });
  revalidatePath(`/facturacion/${c.corridaId}`);
}

export async function cancelarCorrida(formData: FormData) {
  await requerirPermiso("comprobantes:escribir");
  const corridaId = String(formData.get("corridaId"));
  await prisma.comprobante.deleteMany({
    where: { corridaId, estado: { in: ["BORRADOR", "OBSERVADO", "APROBADO"] } },
  });
  await prisma.corridaFacturacion.update({
    where: { id: corridaId },
    data: { estado: "CANCELADA" },
  });
  revalidatePath("/facturacion");
  redirect("/facturacion");
}
