import { NextResponse } from "next/server";
import { sincronizarTodos } from "@/lib/indices/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Actualización automática de los índices.
 *
 * Protegido con CRON_SECRET: se llama con
 *   Authorization: Bearer <CRON_SECRET>
 * desde el cron de Vercel, un cron del sistema o cualquier scheduler.
 *
 * En Vercel, agregar en vercel.json:
 *   { "crons": [{ "path": "/api/cron/indices", "schedule": "0 12 * * *" }] }
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: "Falta CRON_SECRET" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultados = await sincronizarTodos();

  return NextResponse.json({
    ok: resultados.every((r) => r.ok),
    sincronizados: resultados.length,
    resultados,
  });
}
