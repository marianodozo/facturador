"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { registrarAuditoria, requerirPermiso } from "@/lib/auth";
import { aplicarAjuste, proximaFecha } from "@/lib/ajustes";
import { ALICUOTAS_IVA } from "@/lib/fiscal";
import { PERIODICIDADES, esquemaServicio, type DatosServicio } from "./esquema";
import { mensajeDeError } from "@/lib/validaciones";

export type EstadoForm = { error?: string; ok?: string };

function fechaOpcional(v?: string): Date | null {
  return v ? new Date(`${v}T00:00:00`) : null;
}

export async function guardarServicio(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sesion = await requerirPermiso("servicios:escribir");
  const id = String(formData.get("id") ?? "");

  const parsed = esquemaServicio.safeParse({
    ...Object.fromEntries(formData.entries()),
    activo: formData.get("activo") === "on",
    facturaPorAdelantado: formData.get("facturaPorAdelantado") === "on",
  });
  if (!parsed.success) {
    return { error: mensajeDeError(parsed.error) };
  }
  const d = parsed.data;

  if (!ALICUOTAS_IVA.some((a) => Math.abs(a.valor - d.alicuotaIVA) < 0.001)) {
    return { error: "La alícuota de IVA no está habilitada en ARCA" };
  }
  if (!id && d.precioBase === undefined) {
    return { error: "Indicá el precio del servicio" };
  }
  if (d.tipoAjuste === "INDICE") {
    if (!d.indiceId) return { error: "Elegí el índice con el que se ajusta" };
    if (!d.periodoBaseIndice) return { error: "Indicá el período base del índice (formato AAAA-MM)" };
    if (!/^\d{4}-\d{2}$/.test(d.periodoBaseIndice)) {
      return { error: "El período base debe tener el formato AAAA-MM" };
    }
  }
  if (d.tipoAjuste === "PORCENTAJE_FIJO" && !d.ajustePorcentaje) {
    return { error: "Indicá el porcentaje de ajuste" };
  }
  if (d.tipoAjuste !== "NINGUNO" && !d.periodicidadAjuste) {
    return { error: "Indicá cada cuánto se ajusta" };
  }

  const fechaInicio = new Date(`${d.fechaInicio}T00:00:00`);
  const proxima = d.proximaFacturacion ? fechaOpcional(d.proximaFacturacion)! : fechaInicio;
  const periodicidadAjuste = d.periodicidadAjuste
    ? (d.periodicidadAjuste as (typeof PERIODICIDADES)[number])
    : null;

  const datos = {
    clienteId: d.clienteId,
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    moneda: d.moneda,
    alicuotaIVA: d.alicuotaIVA,
    cantidad: d.cantidad,
    unidad: d.unidad || "Unidad",
    periodicidadFacturacion: d.periodicidadFacturacion,
    diaFacturacion: d.diaFacturacion,
    facturaPorAdelantado: d.facturaPorAdelantado,
    fechaInicio,
    fechaFin: fechaOpcional(d.fechaFin),
    proximaFacturacion: proxima,
    tipoAjuste: d.tipoAjuste,
    indiceId: d.tipoAjuste === "INDICE" ? d.indiceId! : null,
    periodicidadAjuste,
    ajustePorcentaje: d.ajustePorcentaje ? Number(d.ajustePorcentaje) : null,
    periodoBaseIndice: d.tipoAjuste === "INDICE" ? d.periodoBaseIndice! : null,
    topeAjustePorc: d.topeAjustePorc ? Number(d.topeAjustePorc) : null,
    diasVencimiento: d.diasVencimiento,
    condicionPago: d.condicionPago || null,
    ordenCompra: d.ordenCompra || null,
    centroCosto: d.centroCosto || null,
    notas: d.notas || null,
    activo: d.activo,
  };

  try {
    if (id) {
      await prisma.servicio.update({ where: { id }, data: datos });
      await registrarAuditoria({
        usuarioId: sesion.sub,
        accion: "ACTUALIZAR",
        entidad: "Servicio",
        entidadId: id,
      });
    } else {
      const creado = await prisma.servicio.create({
        data: {
          ...datos,
          precioBase: d.precioBase!,
          precioActual: d.precioBase!,
          proximoAjuste:
            periodicidadAjuste && d.tipoAjuste !== "NINGUNO"
              ? proximaFecha(fechaInicio, periodicidadAjuste)
              : null,
        },
      });
      await registrarAuditoria({
        usuarioId: sesion.sub,
        accion: "CREAR",
        entidad: "Servicio",
        entidadId: creado.id,
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/servicios");
  redirect("/servicios");
}

/** Cambio manual del precio, con registro en el historial de ajustes. */
export async function ajustarPrecioManual(formData: FormData) {
  const sesion = await requerirPermiso("servicios:escribir");
  const id = String(formData.get("servicioId"));
  const nuevo = Number(formData.get("precioNuevo"));
  const motivo = String(formData.get("motivo") ?? "Ajuste manual");

  const servicio = await prisma.servicio.findUniqueOrThrow({ where: { id } });
  const anterior = Number(servicio.precioActual.toString());
  if (!nuevo || nuevo <= 0) throw new Error("El precio debe ser mayor a cero");

  await prisma.$transaction([
    prisma.servicio.update({
      where: { id },
      data: { precioActual: nuevo, ultimoAjuste: new Date() },
    }),
    prisma.ajusteServicio.create({
      data: {
        servicioId: id,
        precioAnterior: anterior,
        precioNuevo: nuevo,
        coeficiente: anterior > 0 ? nuevo / anterior : 1,
        origen: "MANUAL",
        motivo,
        usuarioId: sesion.sub,
      },
    }),
  ]);

  revalidatePath(`/servicios/${id}`);
}

export async function aplicarAjusteServicio(formData: FormData) {
  const sesion = await requerirPermiso("servicios:escribir");
  const id = String(formData.get("servicioId"));
  await aplicarAjuste(id, sesion.sub);
  revalidatePath(`/servicios/${id}`);
  revalidatePath("/servicios");
}

export async function eliminarServicio(formData: FormData) {
  const sesion = await requerirPermiso("servicios:escribir");
  const id = String(formData.get("servicioId"));
  const facturado = await prisma.comprobanteItem.count({ where: { servicioId: id } });
  if (facturado > 0) {
    await prisma.servicio.update({ where: { id }, data: { activo: false } });
  } else {
    await prisma.servicio.delete({ where: { id } });
  }
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: facturado > 0 ? "ACTUALIZAR" : "ELIMINAR",
    entidad: "Servicio",
    entidadId: id,
  });
  revalidatePath("/servicios");
  redirect("/servicios");
}
