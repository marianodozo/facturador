"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, registrarAuditoria, requerirPermiso } from "@/lib/auth";

export type EstadoForm = { error?: string; ok?: string };

const esquema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio"),
  email: z.string().trim().email("El email no es válido"),
  rol: z.enum(["ADMIN", "FACTURADOR", "LECTURA"]),
  password: z.string().optional(),
});

export async function guardarUsuario(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sesion = await requerirPermiso("usuarios:escribir");
  const id = String(formData.get("id") ?? "");

  const parsed = esquema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" · ") };
  const { nombre, email, rol, password } = parsed.data;

  if (!id && (!password || password.length < 8)) {
    return { error: "La contraseña inicial debe tener al menos 8 caracteres" };
  }
  if (password && password.length > 0 && password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres" };
  }

  try {
    if (id) {
      await prisma.usuario.update({
        where: { id },
        data: {
          nombre,
          email: email.toLowerCase(),
          rol,
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
        },
      });
    } else {
      await prisma.usuario.create({
        data: {
          nombre,
          email: email.toLowerCase(),
          rol,
          passwordHash: await hashPassword(password!),
        },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) return { error: "Ya existe un usuario con ese email" };
    return { error: msg };
  }

  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: id ? "ACTUALIZAR" : "CREAR",
    entidad: "Usuario",
    entidadId: id || null,
    detalle: { email, rol },
  });

  revalidatePath("/usuarios");
  return { ok: id ? "Usuario actualizado" : "Usuario creado" };
}

export async function alternarUsuarioActivo(formData: FormData) {
  const sesion = await requerirPermiso("usuarios:escribir");
  const id = String(formData.get("usuarioId"));

  if (id === sesion.sub) throw new Error("No podés desactivar tu propio usuario");

  const u = await prisma.usuario.findUniqueOrThrow({ where: { id } });

  if (u.activo && u.rol === "ADMIN") {
    const admins = await prisma.usuario.count({ where: { rol: "ADMIN", activo: true } });
    if (admins <= 1) throw new Error("Tiene que quedar al menos un administrador activo");
  }

  await prisma.usuario.update({ where: { id }, data: { activo: !u.activo } });
  await registrarAuditoria({
    usuarioId: sesion.sub,
    accion: "ACTUALIZAR",
    entidad: "Usuario",
    entidadId: id,
    detalle: { activo: !u.activo },
  });
  revalidatePath("/usuarios");
}
