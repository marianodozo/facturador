import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { calcularKpis } from "@/lib/kpi";
import { formatearMoneda, NOMBRE_COMPROBANTE } from "@/lib/fiscal";
import { Badge, Card, Tabla, Td, Th, Titulo, Vacio } from "@/components/ui";
import type { TipoComprobante } from "@prisma/client";

export const dynamic = "force-dynamic";

function Metrica({
  etiqueta,
  valor,
  detalle,
  tono,
  href,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: "neutro" | "alerta" | "ok";
  href?: string;
}) {
  const color =
    tono === "alerta" ? "text-amber-700" : tono === "ok" ? "text-emerald-700" : "text-gray-900";
  const contenido = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300">
      <p className="text-xs font-medium text-gray-500">{etiqueta}</p>
      <p className={`tabular mt-1.5 text-xl font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="mt-1 text-[11px] text-gray-500">{detalle}</p>}
    </div>
  );
  return href ? <Link href={href}>{contenido}</Link> : contenido;
}

function GraficoMensual({ serie }: { serie: { periodo: string; total: number }[] }) {
  const max = Math.max(...serie.map((s) => s.total), 1);
  const alto = 140;

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: alto }}>
        {serie.map((s) => {
          const h = Math.max((s.total / max) * (alto - 20), s.total > 0 ? 3 : 1);
          return (
            <div key={s.periodo} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="tabular text-[9px] text-gray-400">
                {s.total > 0 ? Math.round(s.total / 1000) + "k" : ""}
              </span>
              <div
                className="w-full rounded-t bg-marca-500/85"
                style={{ height: h }}
                title={`${s.periodo}: ${formatearMoneda(s.total)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {serie.map((s) => (
          <span key={s.periodo} className="flex-1 text-center text-[9px] text-gray-500">
            {s.periodo.slice(5)}/{s.periodo.slice(2, 4)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function TableroPage() {
  await requerirSesion();
  const k = await calcularKpis();

  const variacion =
    k.variacionMensual === null
      ? "sin mes anterior"
      : `${k.variacionMensual >= 0 ? "+" : ""}${k.variacionMensual.toFixed(1)}% vs mes anterior`;

  return (
    <>
      <Titulo descripcion={`Período ${k.periodo}`}>Tablero</Titulo>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica
          etiqueta="Facturado del mes"
          valor={formatearMoneda(k.facturadoMes)}
          detalle={variacion}
          tono={k.variacionMensual !== null && k.variacionMensual < 0 ? "alerta" : "ok"}
        />
        <Metrica
          etiqueta="Ingreso recurrente mensual (MRR)"
          valor={formatearMoneda(k.mrr)}
          detalle={`Anualizado ${formatearMoneda(k.arr)}`}
        />
        <Metrica
          etiqueta="IVA débito fiscal"
          valor={formatearMoneda(k.ivaDebito)}
          detalle="Del mes en curso"
        />
        <Metrica
          etiqueta="Ticket promedio"
          valor={formatearMoneda(k.ticketPromedio)}
          detalle={`${k.comprobantesEmitidos} comprobantes emitidos`}
        />
        <Metrica
          etiqueta="Pendiente de emitir"
          valor={formatearMoneda(k.importePendiente)}
          detalle={`${k.pendientesDeEmitir} comprobantes en borrador`}
          tono={k.pendientesDeEmitir > 0 ? "alerta" : "neutro"}
          href="/comprobantes?estado=BORRADOR"
        />
        <Metrica
          etiqueta="Servicios por facturar"
          valor={String(k.serviciosPorFacturar)}
          detalle={`${k.serviciosActivos} servicios activos`}
          href="/facturacion"
        />
        <Metrica
          etiqueta="Ajustes pendientes"
          valor={String(k.ajustesPendientes)}
          detalle="Servicios con ajuste vencido"
          tono={k.ajustesPendientes > 0 ? "alerta" : "neutro"}
          href="/servicios?ajuste=pendiente"
        />
        <Metrica
          etiqueta="Rechazos de ARCA"
          valor={`${k.tasaRechazo.toFixed(1)}%`}
          detalle={`${k.comprobantesRechazados} rechazados este mes`}
          tono={k.comprobantesRechazados > 0 ? "alerta" : "ok"}
        />
      </div>

      {k.certificadoVenceEnDias !== null && k.certificadoVenceEnDias < 45 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El certificado de ARCA vence en {k.certificadoVenceEnDias} días.{" "}
          <Link href="/configuracion" className="font-medium underline">
            Renovalo en Configuración
          </Link>
          .
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Facturación de los últimos 12 meses"
          descripcion="Neto de notas de crédito"
          className="lg:col-span-2"
        >
          <GraficoMensual serie={k.serie} />
        </Card>

        <Card title="Clientes del mes" descripcion={`${k.clientesFacturadosMes} de ${k.clientesActivos} activos`}>
          {k.topClientes.length === 0 ? (
            <Vacio mensaje="Todavía no hay facturación este mes" />
          ) : (
            <ul className="space-y-2.5">
              {k.topClientes.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/clientes/${c.id}`}
                    className="truncate text-sm text-gray-700 hover:text-marca-700"
                  >
                    {c.razonSocial}
                  </Link>
                  <span className="tabular shrink-0 text-sm font-medium text-gray-900">
                    {formatearMoneda(c.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Comprobantes emitidos este mes por tipo">
          {k.porTipo.length === 0 ? (
            <Vacio mensaje="No se emitieron comprobantes en el mes" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Tipo</Th>
                  <Th className="text-right">Cantidad</Th>
                  <Th className="text-right">Importe</Th>
                </tr>
              </thead>
              <tbody>
                {k.porTipo.map((t) => (
                  <tr key={t.tipo}>
                    <Td>
                      <Badge tono={t.tipo.startsWith("NOTA_CREDITO") ? "ambar" : "azul"}>
                        {NOMBRE_COMPROBANTE[t.tipo as TipoComprobante]}
                      </Badge>
                    </Td>
                    <Td className="tabular text-right">{t.cantidad}</Td>
                    <Td className="tabular text-right">{formatearMoneda(t.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>
    </>
  );
}
