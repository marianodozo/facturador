/** Prisma devuelve Decimal; para la UI y los cálculos usamos number. */
export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}
