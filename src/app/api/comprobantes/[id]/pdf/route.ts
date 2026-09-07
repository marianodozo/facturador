import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { obtenerSesion } from "@/lib/auth";
import { generarPdfComprobante, nombreArchivoPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  const comprobante = await prisma.comprobante.findUnique({
    where: { id },
    include: { puntoVenta: true },
  });
  if (!comprobante) return NextResponse.json({ error: "No existe" }, { status: 404 });

  try {
    const pdf = await generarPdfComprobante(id);
    const nombre = nombreArchivoPdf({
      tipo: comprobante.tipo,
      ptoVta: comprobante.puntoVenta.numero,
      numero: comprobante.numero,
      cliRazonSocial: comprobante.cliRazonSocial,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombre}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar el PDF" },
      { status: 500 },
    );
  }
}
