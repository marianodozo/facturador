import type { EstadoComprobante, EstadoCorrida } from "@prisma/client";
import { Badge } from "./ui";

const COMPROBANTE: Record<
  EstadoComprobante,
  { tono: "gris" | "verde" | "ambar" | "rojo" | "azul" | "violeta"; texto: string }
> = {
  BORRADOR: { tono: "gris", texto: "Borrador" },
  OBSERVADO: { tono: "ambar", texto: "Observado" },
  APROBADO: { tono: "azul", texto: "Aprobado" },
  AUTORIZADO: { tono: "verde", texto: "Autorizado" },
  RECHAZADO: { tono: "rojo", texto: "Rechazado" },
  ANULADO: { tono: "violeta", texto: "Anulado" },
};

export function EstadoBadge({ estado }: { estado: EstadoComprobante }) {
  const e = COMPROBANTE[estado];
  return <Badge tono={e.tono}>{e.texto}</Badge>;
}

const CORRIDA: Record<
  EstadoCorrida,
  { tono: "gris" | "verde" | "ambar" | "rojo" | "azul"; texto: string }
> = {
  ABIERTA: { tono: "gris", texto: "Abierta" },
  EN_REVISION: { tono: "ambar", texto: "En revisión" },
  EMITIDA: { tono: "verde", texto: "Emitida" },
  CANCELADA: { tono: "rojo", texto: "Cancelada" },
};

export function EstadoCorridaBadge({ estado }: { estado: EstadoCorrida }) {
  const e = CORRIDA[estado];
  return <Badge tono={e.tono}>{e.texto}</Badge>;
}
