import "server-only";
import { prisma } from "@/lib/db";
import { construirPdf } from "@/lib/pdf-plantilla";

export { datosQR, nombreArchivoPdf, construirPdf } from "@/lib/pdf-plantilla";
export type { DatosPdf } from "@/lib/pdf-plantilla";

/** Lee el comprobante de la base y lo dibuja. */
export async function generarPdfComprobante(comprobanteId: string): Promise<Buffer> {
  const comprobante = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    include: {
      cliente: true,
      items: { orderBy: { orden: "asc" } },
      lineasIVA: true,
      puntoVenta: true,
      comprobanteAsociado: { include: { puntoVenta: true } },
    },
  });
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: 1 } });

  return construirPdf({ empresa, comprobante });
}
