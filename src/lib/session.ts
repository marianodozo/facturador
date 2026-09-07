import { SignJWT, jwtVerify } from "jose";
import type { Rol } from "@prisma/client";

export const COOKIE_SESION = "facturador_session";
const DURACION_HORAS = 12;

export interface Sesion {
  sub: string;
  email: string;
  nombre: string;
  rol: Rol;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Falta AUTH_SECRET en las variables de entorno");
  return new TextEncoder().encode(s);
}

export async function firmarSesion(payload: Sesion): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_HORAS}h`)
    .sign(secret());
}

export async function verificarSesion(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      nombre: String(payload.nombre),
      rol: payload.rol as Rol,
    };
  } catch {
    return null;
  }
}

// --- Permisos -------------------------------------------------------------

export const PERMISOS = {
  ADMIN: [
    "clientes:leer", "clientes:escribir",
    "servicios:leer", "servicios:escribir",
    "comprobantes:leer", "comprobantes:escribir", "comprobantes:emitir", "comprobantes:anular",
    "indices:leer", "indices:escribir",
    "config:leer", "config:escribir",
    "usuarios:leer", "usuarios:escribir",
    "auditoria:leer",
  ],
  FACTURADOR: [
    "clientes:leer", "clientes:escribir",
    "servicios:leer", "servicios:escribir",
    "comprobantes:leer", "comprobantes:escribir", "comprobantes:emitir",
    "indices:leer", "indices:escribir",
    "config:leer",
  ],
  LECTURA: [
    "clientes:leer",
    "servicios:leer",
    "comprobantes:leer",
    "indices:leer",
  ],
} as const;

export type Permiso = (typeof PERMISOS)["ADMIN"][number];

export function puede(rol: Rol, permiso: Permiso): boolean {
  return (PERMISOS[rol] as readonly string[]).includes(permiso);
}

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  FACTURADOR: "Facturador",
  LECTURA: "Solo lectura",
};
