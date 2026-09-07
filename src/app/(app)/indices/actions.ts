"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requerirPermiso } from "@/lib/auth";
import { sincronizarIndice, sincronizarTodos } from "@/lib/indices/sincronizar";
import { catalogoBcra } from "@/lib/indices/fuentes";

export async function crearIndice(formData: FormData) {
  await requerirPermiso("indices:escribir");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const fuente = String(formData.get("fuente") ?? "").trim();
  if (!codigo || !nombre) throw new Error("Código y nombre son obligatorios");

  await prisma.indice.create({ data: { codigo, nombre, fuente: fuente || null } });
  revalidatePath("/indices");
}

/** Configura de dónde se actualiza el índice automáticamente. */
export async function configurarFuente(formData: FormData) {
  await requerirPermiso("indices:escribir");
  const id = String(formData.get("indiceId"));
  const fuenteTipo = String(formData.get("fuenteTipo") ?? "MANUAL") as
    | "MANUAL"
    | "DATOS_GOB"
    | "BCRA";
  const fuenteId = String(formData.get("fuenteId") ?? "").trim();

  if (fuenteTipo !== "MANUAL" && !fuenteId) {
    throw new Error("Indicá el id de la serie en la fuente elegida");
  }

  await prisma.indice.update({
    where: { id },
    data: {
      fuenteTipo,
      fuenteId: fuenteTipo === "MANUAL" ? null : fuenteId,
      ultimoError: null,
    },
  });
  revalidatePath("/indices");
}

export async function sincronizarAction(formData: FormData) {
  await requerirPermiso("indices:escribir");
  await sincronizarIndice(String(formData.get("indiceId")));
  revalidatePath("/indices");
}

export async function sincronizarTodosAction() {
  await requerirPermiso("indices:escribir");
  const r = await sincronizarTodos();
  revalidatePath("/indices");
  return r;
}

/** Catálogo de variables del BCRA, para encontrar el id correcto. */
export async function verCatalogoBcra(): Promise<{ ok?: string; error?: string }> {
  await requerirPermiso("indices:leer");
  try {
    const catalogo = await catalogoBcra();
    const relevantes = catalogo.filter((c) =>
      /CER|UVA|UVI|locaci|ICL|inflaci/i.test(c.descripcion),
    );
    const lista = (relevantes.length ? relevantes : catalogo.slice(0, 25))
      .map((c) => `${c.id} — ${c.descripcion}`)
      .join("\n");
    return { ok: lista || "El BCRA no devolvió variables" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
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
