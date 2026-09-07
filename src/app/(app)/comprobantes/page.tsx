import Link from "next/link";
import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { NOMBRE_COMPROBANTE, formatearMoneda, formatearNumero } from "@/lib/fiscal";
import { Card, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";
import { EstadoBadge } from "@/components/estados";
import type { EstadoComprobante, TipoComprobante } from "@prisma/client";

export const dynamic = "force-dynamic";

const ESTADOS: EstadoComprobante[] = [
  "BORRADOR",
  "OBSERVADO",
  "APROBADO",
  "AUTORIZADO",
  "RECHAZADO",
  "ANULADO",
];

export default async function ComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; tipo?: string; periodo?: string }>;
}) {
  await requerirSesion();
  const { q, estado, tipo, periodo } = await searchParams;

  const comprobantes = await prisma.comprobante.findMany({
    where: {
      ...(estado ? { estado: estado as EstadoComprobante } : {}),
      ...(tipo ? { tipo: tipo as TipoComprobante } : {}),
      ...(periodo ? { periodo } : {}),
      ...(q
        ? {
            OR: [
              { cliRazonSocial: { contains: q, mode: "insensitive" as const } },
              { cliNroDoc: { contains: q } },
              { cae: { contains: q } },
            ],
          }
        : {}),
    },
    include: { puntoVenta: true },
    orderBy: [{ fechaEmision: "desc" }, { numero: "desc" }],
    take: 200,
  });

  const total = comprobantes
    .filter((c) => c.estado === "AUTORIZADO")
    .reduce((a, c) => a + (c.tipo.startsWith("NOTA_CREDITO") ? -1 : 1) * dec(c.importeTotal), 0);

  return (
    <>
      <Titulo descripcion={`${comprobantes.length} comprobantes · autorizados ${formatearMoneda(total)}`}>
        Comprobantes
      </Titulo>

      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por cliente, CUIT o CAE…"
            className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="estado"
            defaultValue={estado ?? ""}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e.charAt(0) + e.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select
            name="tipo"
            defaultValue={tipo ?? ""}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(NOMBRE_COMPROBANTE).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          <input
            name="periodo"
            defaultValue={periodo ?? ""}
            placeholder="AAAA-MM"
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Filtrar
          </button>
        </form>

        {comprobantes.length === 0 ? (
          <Vacio mensaje="No hay comprobantes que coincidan con el filtro" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Comprobante</Th>
                <Th>Cliente</Th>
                <Th>Fecha</Th>
                <Th>Estado</Th>
                <Th>CAE</Th>
                <Th className="text-right">Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {comprobantes.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <Td>
                    <Link href={`/comprobantes/${c.id}`} className="font-medium hover:text-marca-700">
                      {NOMBRE_COMPROBANTE[c.tipo]}
                    </Link>
                    <p className="tabular text-xs text-gray-500">
                      {formatearNumero(c.puntoVenta.numero, c.numero)}
                    </p>
                  </Td>
                  <Td className="text-gray-700">{c.cliRazonSocial}</Td>
                  <Td className="tabular text-gray-600">
                    {c.fechaEmision.toLocaleDateString("es-AR")}
                  </Td>
                  <Td>
                    <EstadoBadge estado={c.estado} />
                  </Td>
                  <Td className="tabular text-xs text-gray-500">{c.cae ?? "—"}</Td>
                  <Td className="tabular text-right font-medium">
                    {formatearMoneda(dec(c.importeTotal), c.moneda)}
                  </Td>
                  <Td className="text-right">
                    <a
                      href={`/api/comprobantes/${c.id}/pdf`}
                      className="text-sm text-marca-600 hover:underline"
                    >
                      PDF
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}
