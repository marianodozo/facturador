"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requerirPermiso } from "@/lib/auth";

export async function crearIndice(formData: FormData) {
  await requerirPermiso("indices:escribir");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const fuente = String(formData.get("fuente") ?? "").trim();
  if (!codigo || !nombre) throw new Error("Código y nombre son obligatorios");

  await prisma.indice.create({ data: { codigo, nombre, fuente: fuente || null } });
  revalidatePath("/indices");
}

/**
 * Carga valores en lote. Acepta una línea por período:
 *   2026-01  1234.56
 *   2026-02;1300,10
 */
export async function cargarValores(formData: FormData) {
  await requerirPermiso("indices:escribir");
  const indiceId = String(formData.get("indiceId"));
  const texto = String(formData.get("valores") ?? "");

  const filas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [periodo, valorRaw] = l.split(/[\s;,\t]+(?=[\d.,]+$)|[\s;\t]+/);
      return { periodo: (periodo ?? "").trim(), valor: (valorRaw ?? "").trim().replace(",", ".") };
    })
    .filter((f) => /^\d{4}-\d{2}$/.test(f.periodo) && f.valor && !Number.isNaN(Number(f.valor)));

  if (!filas.length) {
    throw new Error("No se reconoció ninguna fila. Usá el formato AAAA-MM valor, una por línea.");
  }

  for (const f of filas) {
    await prisma.indiceValor.upsert({
      where: { indiceId_periodo: { indiceId, periodo: f.periodo } },
      create: { indiceId, periodo: f.periodo, valor: Number(f.valor) },
      update: { valor: Number(f.valor) },
    });
  }

  revalidatePath("/indices");
}

export async function eliminarValor(formData: FormData) {
  await requerirPermiso("indices:escribir");
  await prisma.indiceValor.delete({ where: { id: String(formData.get("valorId")) } });
  revalidatePath("/indices");
}
