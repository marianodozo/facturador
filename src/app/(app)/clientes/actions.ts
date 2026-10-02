"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { registrarAuditoria, requerirPermiso } from "@/lib/auth";
import { validarCuit } from "@/lib/fiscal";
import { mensajeDeError } from "@/lib/validaciones";

const esquema = z.object({
  codigo: z.string().trim().min(1, "El código es obligatorio"),
  razonSocial: z.string().trim().min(2, "La razón social es obligatoria"),
  nombreFantasia: z.string().trim().optional(),
  tipoDocumento: z.enum(["CUIT", "CUIL", "DNI", "PASAPORTE", "CDI", "SIN_IDENTIFICAR"]),
  numeroDocumento: z.string().trim().min(1, "El número de documento es obligatorio"),
  condicionIVA: z.enum([
    "RESPONSABLE_INSCRIPTO",
    "MONOTRIBUTO",
    "MONOTRIBUTO_SOCIAL",
    "EXENTO",
    "CONSUMIDOR_FINAL",
    "NO_CATEGORIZADO",
    "IVA_LIBERADO",
    "NO_ALCANZADO",
  ]),
  email: z.string().trim().optional(),
  emailFacturacion: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  contacto: z.string().trim().optional(),
  domicilio: z.string().trim().optional(),
  localidad: z.string().trim().optional(),
  provincia: z.string().trim().optional(),
  codigoPostal: z.string().trim().optional(),
  moneda: z.enum(["PES", "DOL"]),
  diasVencimiento: z.coerce
    .number("Los días de vencimiento tienen que ser un número")
    .int()
    .min(0, "Los días de vencimiento no pueden ser negativos")
    .max(365, "Los días de vencimiento no pueden superar 365"),
  condicionPago: z.string().trim().optional(),
  notas: z.string().trim().optional(),
  activo: z.coerce.boolean(),
});

export type EstadoForm = { error?: string; ok?: string };

function leer(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return esquema.safeParse({ ...raw, activo: formData.get("activo") === "on" });
}

export async function guardarCliente(
  _prev: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const sesion = await requerirPermiso("clientes:escribir");
  const id = String(formData.get("id") ?? "");

  const parsed = leer(formData);
  if (!parsed.success) {
    return { error: mensajeDeError(parsed.error) };
  }
  const datos = parsed.data;

  if (["CUIT", "CUIL"].includes(datos.tipoDocumento) && !validarCuit(datos.numeroDocumento)) {
    return { error: `El ${datos.tipoDocumento} ingresado no es válido (dígito verificador)` };
  }
  if (datos.condicionIVA === "RESPONSABLE_INSCRIPTO" && datos.tipoDocumento !== "CUIT") {
    return { error: "Un Responsable Inscripto debe identificarse con CUIT" };
  }

  try {
    if (id) {
      await prisma.cliente.update({ where: { id }, data: datos });
      await registrarAuditoria({
        usuarioId: sesion.sub,
        accion: "ACTUALIZAR",
        entidad: "Cliente",
        entidadId: id,
        detalle: datos,
      });
    } else {
      const creado = await prisma.cliente.create({ data: datos });
      await registrarAuditoria({
        usuarioId: sesion.sub,
        accion: "CREAR",
        entidad: "Cliente",
        entidadId: creado.id,
        detalle: datos,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) return { error: "Ya existe un cliente con ese código" };
    return { error: msg };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function alternarClienteActivo(id: string) {
  const sesion = await requerirPermiso("clientes:escribir");
  const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id } });
  await prisma.cliente.update({ where: { id }, data: { activo: !cliente.activo } });
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "ACTUALIZAR",
    entidad: "Cliente",
    entidadId: id,
    detalle: { activo: !cliente.activo },
  });
  revalidatePath("/clientes");
}

export async function eliminarCliente(id: string) {
  const sesion = await requerirPermiso("clientes:escribir");
  const comprobantes = await prisma.comprobante.count({ where: { clienteId: id } });
  if (comprobantes > 0) {
    throw new Error(
      "El cliente tiene comprobantes emitidos: no se puede eliminar, sólo desactivar",
    );
  }
  await prisma.cliente.delete({ where: { id } });
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "ELIMINAR",
    entidad: "Cliente",
    entidadId: id,
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}
