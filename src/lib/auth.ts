import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  COOKIE_SESION,
  firmarSesion,
  puede,
  verificarSesion,
  type Permiso,
  type Sesion,
} from "@/lib/session";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verificarPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function iniciarSesion(email: string, password: string): Promise<Sesion> {
  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!usuario || !usuario.activo) throw new Error("Usuario o contraseña incorrectos");

  const ok = await verificarPassword(password, usuario.passwordHash);
  if (!ok) throw new Error("Usuario o contraseña incorrectos");

  const sesion: Sesion = {
    sub: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
  };

  const token = await firmarSesion(sesion);
  const store = await cookies();
  store.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcceso: new Date() },
  });
  await registrarAuditoria({ usuarioId: usuario.id, accion: "LOGIN", entidad: "Usuario", entidadId: usuario.id });

  return sesion;
}

export async function cerrarSesion(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_SESION);
}

export async function obtenerSesion(): Promise<Sesion | null> {
  const store = await cookies();
  return verificarSesion(store.get(COOKIE_SESION)?.value);
}

/** Corta el render y manda al login si no hay sesión. */
export async function requerirSesion(): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  return sesion;
}

/** Corta si el rol no tiene el permiso pedido. */
export async function requerirPermiso(permiso: Permiso): Promise<Sesion> {
  const sesion = await requerirSesion();
  if (!puede(sesion.rol, permiso)) {
    throw new Error(`No tenés permiso para esta acción (${permiso})`);
  }
  return sesion;
}

export async function registrarAuditoria(datos: {
  usuarioId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: unknown;
}): Promise<void> {
  try {
    const h = await headers();
    await prisma.auditoria.create({
      data: {
        usuarioId: datos.usuarioId ?? null,
        accion: datos.accion,
        entidad: datos.entidad,
        entidadId: datos.entidadId ?? null,
        detalle: (datos.detalle ?? null) as never,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    });
  } catch {
    // la auditoría nunca debe romper la operación principal
  }
}
