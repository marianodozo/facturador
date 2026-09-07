"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { guardarServicio, type EstadoForm } from "./actions";
import { ALICUOTAS_IVA } from "@/lib/fiscal";
import { NOMBRE_PERIODICIDAD } from "@/lib/ajustes";
import { Alerta, Boton, Campo, Card, Input, Select, TextArea } from "@/components/ui";

type ServicioPlano = {
  id: string;
  clienteId: string;
  nombre: string;
  descripcion: string | null;
  moneda: string;
  precioBase: string;
  precioActual: string;
  alicuotaIVA: string;
  cantidad: string;
  unidad: string;
  periodicidadFacturacion: string;
  diaFacturacion: number;
  facturaPorAdelantado: boolean;
  fechaInicio: string;
  fechaFin: string | null;
  proximaFacturacion: string;
  tipoAjuste: string;
  indiceId: string | null;
  periodicidadAjuste: string | null;
  ajustePorcentaje: string | null;
  periodoBaseIndice: string | null;
  topeAjustePorc: string | null;
  diasVencimiento: number;
  condicionPago: string | null;
  ordenCompra: string | null;
  centroCosto: string | null;
  notas: string | null;
  activo: boolean;
};

const PERIODICIDADES = Object.entries(NOMBRE_PERIODICIDAD);

export function ServicioForm({
  servicio,
  clientes,
  indices,
  clienteInicial,
}: {
  servicio?: ServicioPlano;
  clientes: { id: string; razonSocial: string; codigo: string }[];
  indices: { id: string; codigo: string; nombre: string }[];
  clienteInicial?: string;
}) {
  const [estado, accion, pendiente] = useActionState(guardarServicio, {} as EstadoForm);
  const [tipoAjuste, setTipoAjuste] = useState(servicio?.tipoAjuste ?? "NINGUNO");

  return (
    <form action={accion} className="space-y-4">
      {servicio && <input type="hidden" name="id" value={servicio.id} />}
      {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}

      <Card title="Servicio">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Cliente">
            <Select
              name="clienteId"
              defaultValue={servicio?.clienteId ?? clienteInicial ?? ""}
              required
            >
              <option value="">Elegir cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial} ({c.codigo})
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Nombre del servicio" className="lg:col-span-2">
            <Input name="nombre" defaultValue={servicio?.nombre} required />
          </Campo>
          <Campo
            label="Detalle que aparece en la factura"
            className="sm:col-span-2 lg:col-span-3"
            ayuda="Si lo dejás vacío se usa el nombre del servicio"
          >
            <TextArea name="descripcion" rows={2} defaultValue={servicio?.descripcion ?? ""} />
          </Campo>
        </div>
      </Card>

      <Card title="Precio e IVA">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Moneda">
            <Select name="moneda" defaultValue={servicio?.moneda ?? "PES"}>
              <option value="PES">Pesos</option>
              <option value="DOL">Dólares</option>
            </Select>
          </Campo>
          <Campo
            label={servicio ? "Precio base (original)" : "Precio"}
            ayuda={servicio ? `Precio vigente: ${servicio.precioActual}` : undefined}
          >
            <Input
              name="precioBase"
              type="number"
              step="0.01"
              min="0"
              defaultValue={servicio?.precioBase}
              required
              disabled={!!servicio}
            />
          </Campo>
          <Campo label="Cantidad">
            <Input
              name="cantidad"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={servicio?.cantidad ?? 1}
            />
          </Campo>
          <Campo label="Unidad">
            <Input name="unidad" defaultValue={servicio?.unidad ?? "Unidad"} />
          </Campo>
          <Campo label="Alícuota de IVA">
            <Select name="alicuotaIVA" defaultValue={servicio?.alicuotaIVA ?? "21"}>
              {ALICUOTAS_IVA.map((a) => (
                <option key={a.id} value={a.valor}>
                  {a.etiqueta}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        {servicio && (
          <p className="mt-3 text-xs text-gray-500">
            El precio base no se edita desde acá: el precio vigente se modifica con un ajuste, así
            queda registrado en el historial.
          </p>
        )}
      </Card>

      <Card title="Facturación" descripcion="Cuándo y cada cuánto se emite el comprobante">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Periodicidad">
            <Select
              name="periodicidadFacturacion"
              defaultValue={servicio?.periodicidadFacturacion ?? "MENSUAL"}
            >
              {PERIODICIDADES.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Día de facturación" ayuda="Del 1 al 28">
            <Input
              name="diaFacturacion"
              type="number"
              min={1}
              max={28}
              defaultValue={servicio?.diaFacturacion ?? 1}
            />
          </Campo>
          <Campo label="Inicio del contrato">
            <Input name="fechaInicio" type="date" defaultValue={servicio?.fechaInicio} required />
          </Campo>
          <Campo label="Fin del contrato" ayuda="Opcional">
            <Input name="fechaFin" type="date" defaultValue={servicio?.fechaFin ?? ""} />
          </Campo>
          <Campo label="Próxima facturación">
            <Input
              name="proximaFacturacion"
              type="date"
              defaultValue={servicio?.proximaFacturacion}
            />
          </Campo>
          <Campo label="Días de vencimiento del pago">
            <Input
              name="diasVencimiento"
              type="number"
              min={0}
              defaultValue={servicio?.diasVencimiento ?? 0}
            />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="facturaPorAdelantado"
              defaultChecked={servicio?.facturaPorAdelantado ?? true}
              className="h-4 w-4 rounded border-gray-300"
            />
            Se factura por adelantado
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={servicio?.activo ?? true}
              className="h-4 w-4 rounded border-gray-300"
            />
            Servicio activo
          </label>
        </div>
      </Card>

      <Card
        title="Ajuste de precio"
        descripcion="Cómo y cada cuánto se actualiza el valor del servicio"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Tipo de ajuste">
            <Select
              name="tipoAjuste"
              value={tipoAjuste}
              onChange={(e) => setTipoAjuste(e.target.value)}
            >
              <option value="NINGUNO">Sin ajuste</option>
              <option value="INDICE">Por índice</option>
              <option value="PORCENTAJE_FIJO">Porcentaje fijo</option>
            </Select>
          </Campo>

          {tipoAjuste !== "NINGUNO" && (
            <Campo label="Periodicidad del ajuste">
              <Select
                name="periodicidadAjuste"
                defaultValue={servicio?.periodicidadAjuste ?? "TRIMESTRAL"}
              >
                {PERIODICIDADES.filter(([v]) => v !== "UNICA").map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </Select>
            </Campo>
          )}

          {tipoAjuste === "INDICE" && (
            <>
              <Campo label="Índice">
                <Select name="indiceId" defaultValue={servicio?.indiceId ?? ""}>
                  <option value="">Elegir índice…</option>
                  {indices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.codigo} — {i.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Período base" ayuda="AAAA-MM del valor con el que se pactó el precio">
                <Input
                  name="periodoBaseIndice"
                  placeholder="2026-01"
                  pattern="\d{4}-\d{2}"
                  defaultValue={servicio?.periodoBaseIndice ?? ""}
                />
              </Campo>
            </>
          )}

          {tipoAjuste === "PORCENTAJE_FIJO" && (
            <Campo label="Porcentaje por período">
              <Input
                name="ajustePorcentaje"
                type="number"
                step="0.01"
                placeholder="10"
                defaultValue={servicio?.ajustePorcentaje ?? ""}
              />
            </Campo>
          )}

          {tipoAjuste !== "NINGUNO" && (
            <Campo label="Tope por ajuste (%)" ayuda="Opcional: limita la suba máxima">
              <Input
                name="topeAjustePorc"
                type="number"
                step="0.01"
                defaultValue={servicio?.topeAjustePorc ?? ""}
              />
            </Campo>
          )}
        </div>
      </Card>

      <Card title="Datos comerciales">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Condición de venta">
            <Input
              name="condicionPago"
              placeholder="30 días fecha factura"
              defaultValue={servicio?.condicionPago ?? ""}
            />
          </Campo>
          <Campo label="Orden de compra">
            <Input name="ordenCompra" defaultValue={servicio?.ordenCompra ?? ""} />
          </Campo>
          <Campo label="Centro de costo">
            <Input name="centroCosto" defaultValue={servicio?.centroCosto ?? ""} />
          </Campo>
          <Campo label="Notas internas" className="sm:col-span-2 lg:col-span-3">
            <TextArea name="notas" rows={2} defaultValue={servicio?.notas ?? ""} />
          </Campo>
        </div>
      </Card>

      <div className="flex gap-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : servicio ? "Guardar cambios" : "Crear servicio"}
        </Boton>
        <Link
          href="/servicios"
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
