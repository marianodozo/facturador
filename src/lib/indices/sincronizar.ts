import "server-only";
import { prisma } from "@/lib/db";
import { traerSerie } from "./fuentes";

export interface ResultadoSync {
  indice: string;
  ok: boolean;
  nuevos: number;
  actualizados: number;
  ultimoPeriodo?: string;
  mensaje: string;
}

/** Trae la serie de la fuente configurada y hace upsert de los períodos. */
export async function sincronizarIndice(indiceId: string): Promise<ResultadoSync> {
  const indice = await prisma.indice.findUniqueOrThrow({
    where: { id: indiceId },
    include: { valores: { orderBy: { periodo: "desc" }, take: 1 } },
  });

  if (indice.fuenteTipo === "MANUAL" || !indice.fuenteId) {
    return {
      indice: indice.codigo,
      ok: false,
      nuevos: 0,
      actualizados: 0,
      mensaje: "El índice está configurado como carga manual",
    };
  }

  // Pedimos desde 6 meses antes del último dato: las fuentes revisan valores.
  const ultimo = indice.valores[0]?.periodo;
  const desde = ultimo
    ? new Date(
        Number(ultimo.slice(0, 4)),
        Number(ultimo.slice(5, 7)) - 7,
        1,
      )
        .toISOString()
        .slice(0, 10)
    : "2016-12-01";

  try {
    const serie = await traerSerie(indice.fuenteTipo, indice.fuenteId, desde);

    let nuevos = 0;
    let actualizados = 0;

    for (const v of serie) {
      const existente = await prisma.indiceValor.findUnique({
        where: { indiceId_periodo: { indiceId, periodo: v.periodo } },
      });

      if (!existente) {
        await prisma.indiceValor.create({
          data: { indiceId, periodo: v.periodo, valor: v.valor },
        });
        nuevos++;
      } else if (Math.abs(Number(existente.valor.toString()) - v.valor) > 0.000001) {
        await prisma.indiceValor.update({
          where: { id: existente.id },
          data: { valor: v.valor },
        });
        actualizados++;
      }
    }

    await prisma.indice.update({
      where: { id: indiceId },
      data: { ultimaSync: new Date(), ultimoError: null },
    });

    return {
      indice: indice.codigo,
      ok: true,
      nuevos,
      actualizados,
      ultimoPeriodo: serie.at(-1)?.periodo,
      mensaje: `${indice.codigo}: ${nuevos} períodos nuevos, ${actualizados} actualizados (último: ${
        serie.at(-1)?.periodo ?? "—"
      })`,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await prisma.indice.update({
      where: { id: indiceId },
      data: { ultimaSync: new Date(), ultimoError: mensaje },
    });
    return {
      indice: indice.codigo,
      ok: false,
      nuevos: 0,
      actualizados: 0,
      mensaje: `${indice.codigo}: ${mensaje}`,
    };
  }
}

/** Sincroniza todos los índices activos con fuente automática. */
export async function sincronizarTodos(): Promise<ResultadoSync[]> {
  const indices = await prisma.indice.findMany({
    where: { activo: true, fuenteTipo: { not: "MANUAL" }, fuenteId: { not: null } },
    select: { id: true },
  });

  const resultados: ResultadoSync[] = [];
  for (const i of indices) resultados.push(await sincronizarIndice(i.id));
  return resultados;
}
