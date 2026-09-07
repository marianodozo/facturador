import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Prisma devuelve Decimal; para la UI y los cálculos usamos number. */
export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}
