"use client";

import { useActionState } from "react";
import { crearCorrida, type EstadoForm } from "./actions";
import { Alerta, Boton, Campo, Card, Input } from "@/components/ui";

export function NuevaCorrida({ periodo, hoy }: { periodo: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(crearCorrida, {} as EstadoForm);

  return (
    <Card
      title="Nueva corrida de facturación"
      descripcion="Genera los borradores de todos los servicios que vencen en el período. No se emite nada hasta pasar el control previo."
    >
      <form action={accion} className="space-y-4">
        {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Período" ayuda="AAAA-MM">
            <Input name="periodo" defaultValue={periodo} pattern="\d{4}-\d{2}" required />
          </Campo>
          <Campo label="Fecha de emisión">
            <Input name="fechaEmision" type="date" defaultValue={hoy} required />
          </Campo>
          <Campo label="Descripción" className="lg:col-span-2">
            <Input name="descripcion" placeholder="Facturación mensual de servicios" />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="aplicarAjustes"
            defaultChecked
            className="h-4 w-4 rounded border-gray-300"
          />
          Aplicar los ajustes de precio pendientes antes de generar
        </label>
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Generando…" : "Generar borradores"}
        </Boton>
      </form>
    </Card>
  );
}
