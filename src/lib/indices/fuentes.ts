import "server-only";
import type { FuenteIndice } from "@prisma/client";

/**
 * Fuentes públicas para actualizar los índices sin cargarlos a mano.
 *
 *  - DATOS_GOB: apis.datos.gob.ar/series — series de tiempo del Estado.
 *    Ahí vive el IPC del INDEC. La serie se identifica con un id como
 *    `148.3_INIVELNAL_DICI_M_26` (IPC nivel general, nacional, mensual).
 *
 *  - BCRA: api.bcra.gob.ar/estadisticas/v3.0/monetarias — CER, UVA, ICL y
 *    demás variables monetarias. El id es numérico y se puede listar con
 *    `catalogoBcra()`, así no hay que adivinarlo.
 *
 * Las series diarias (CER, UVA, ICL) se consolidan a un valor por mes tomando
 * el último día con dato de cada mes.
 */

export interface ValorSerie {
  periodo: string; // "YYYY-MM"
  valor: number;
  fecha: string; // fecha original del dato
}

const TIMEOUT_MS = 20_000;

async function traer(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "facturador/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`La fuente respondió ${res.status} ${res.statusText}`);
  }
  return res;
}

function aPeriodo(fecha: string): string {
  return fecha.slice(0, 7);
}

/** Deja un solo valor por mes: el del último día con dato. */
function consolidarMensual(valores: ValorSerie[]): ValorSerie[] {
  const porMes = new Map<string, ValorSerie>();
  for (const v of [...valores].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    porMes.set(v.periodo, v);
  }
  return [...porMes.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
}

// --- apis.datos.gob.ar ----------------------------------------------------

export async function serieDatosGob(serieId: string, desde: string): Promise<ValorSerie[]> {
  const url =
    `https://apis.datos.gob.ar/series/api/series/?ids=${encodeURIComponent(serieId)}` +
    `&format=json&start_date=${desde}&limit=1000`;

  const json = (await (await traer(url)).json()) as {
    data?: [string, number | null][];
    errors?: { error: string }[];
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.error).join(" · "));
  }
  if (!json.data?.length) {
    throw new Error(`La serie ${serieId} no devolvió datos`);
  }

  return consolidarMensual(
    json.data
      .filter((d): d is [string, number] => typeof d[1] === "number")
      .map(([fecha, valor]) => ({ fecha, valor, periodo: aPeriodo(fecha) })),
  );
}

// --- api.bcra.gob.ar ------------------------------------------------------

interface RespuestaBcra {
  status?: number;
  results?: { idVariable: number; fecha: string; valor: number }[];
  errorMessages?: string[];
}

export async function serieBcra(idVariable: string, desde: string): Promise<ValorSerie[]> {
  const hasta = new Date().toISOString().slice(0, 10);
  const url =
    `https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/${encodeURIComponent(idVariable)}` +
    `?desde=${desde}&hasta=${hasta}&limit=3000`;

  const json = (await (await traer(url)).json()) as RespuestaBcra;

  if (json.errorMessages?.length) throw new Error(json.errorMessages.join(" · "));
  if (!json.results?.length) throw new Error(`La variable ${idVariable} no devolvió datos`);

  return consolidarMensual(
    json.results.map((r) => ({
      fecha: r.fecha,
      valor: r.valor,
      periodo: aPeriodo(r.fecha),
    })),
  );
}

/** Catálogo de variables del BCRA, para elegir el id sin adivinarlo. */
export async function catalogoBcra(): Promise<{ id: number; descripcion: string }[]> {
  const json = (await (
    await traer("https://api.bcra.gob.ar/estadisticas/v3.0/monetarias")
  ).json()) as {
    results?: { idVariable: number; descripcion: string }[];
  };
  return (json.results ?? []).map((r) => ({ id: r.idVariable, descripcion: r.descripcion }));
}

// --- despacho -------------------------------------------------------------

export async function traerSerie(
  fuenteTipo: FuenteIndice,
  fuenteId: string,
  desde: string,
): Promise<ValorSerie[]> {
  switch (fuenteTipo) {
    case "DATOS_GOB":
      return serieDatosGob(fuenteId, desde);
    case "BCRA":
      return serieBcra(fuenteId, desde);
    default:
      throw new Error("El índice está configurado como carga manual");
  }
}

export { SERIES_SUGERIDAS } from "./series";
