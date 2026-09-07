"use server";

import { redirect } from "next/navigation";
import { iniciarSesion } from "@/lib/auth";

export async function accionLogin(_prev: { error?: string }, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const volver = String(formData.get("volver") ?? "/");

  if (!email || !password) return { error: "Completá email y contraseña" };

  try {
    await iniciarSesion(email, password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo iniciar sesión" };
  }

  redirect(volver.startsWith("/") ? volver : "/");
}
