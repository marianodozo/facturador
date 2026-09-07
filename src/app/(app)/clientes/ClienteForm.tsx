"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Cliente } from "@prisma/client";
import { guardarCliente, type EstadoForm } from "./actions";
import { NOMBRE_CONDICION_IVA } from "@/lib/fiscal";
import { Alerta, Boton, Campo, Card, Input, Select, TextArea } from "@/components/ui";

const CONDICIONES = Object.entries(NOMBRE_CONDICION_IVA);
const DOCUMENTOS = ["CUIT", "CUIL", "DNI", "PASAPORTE", "CDI", "SIN_IDENTIFICAR"];

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const [estado, accion, pendiente] = useActionState(guardarCliente, {} as EstadoForm);

  return (
    <form action={accion} className="space-y-4">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}

      <Card title="Identificación">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Código interno" ayuda="Legajo o código con el que lo identificás">
            <Input name="codigo" defaultValue={cliente?.codigo} required />
          </Campo>
          <Campo label="Razón social" className="lg:col-span-2">
            <Input name="razonSocial" defaultValue={cliente?.razonSocial} required />
          </Campo>
          <Campo label="Nombre de fantasía">
            <Input name="nombreFantasia" defaultValue={cliente?.nombreFantasia ?? ""} />
          </Campo>
          <Campo label="Tipo de documento">
            <Select name="tipoDocumento" defaultValue={cliente?.tipoDocumento ?? "CUIT"}>
              {DOCUMENTOS.map((d) => (
                <option key={d} value={d}>
                  {d.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Número de documento">
            <Input name="numeroDocumento" defaultValue={cliente?.numeroDocumento} required />
          </Campo>
          <Campo
            label="Condición frente al IVA"
            ayuda="Define si se le emite factura A, B o C"
            className="lg:col-span-2"
          >
            <Select name="condicionIVA" defaultValue={cliente?.condicionIVA ?? "RESPONSABLE_INSCRIPTO"}>
              {CONDICIONES.map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={cliente?.activo ?? true}
              className="h-4 w-4 rounded border-gray-300"
            />
            Cliente activo
          </label>
        </div>
      </Card>

      <Card title="Contacto y domicilio">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Persona de contacto">
            <Input name="contacto" defaultValue={cliente?.contacto ?? ""} />
          </Campo>
          <Campo label="Email">
            <Input name="email" type="email" defaultValue={cliente?.email ?? ""} />
          </Campo>
          <Campo label="Email de facturación" ayuda="A donde se manda la factura">
            <Input name="emailFacturacion" type="email" defaultValue={cliente?.emailFacturacion ?? ""} />
          </Campo>
          <Campo label="Teléfono">
            <Input name="telefono" defaultValue={cliente?.telefono ?? ""} />
          </Campo>
          <Campo label="Domicilio" className="lg:col-span-2">
            <Input name="domicilio" defaultValue={cliente?.domicilio ?? ""} />
          </Campo>
          <Campo label="Localidad">
            <Input name="localidad" defaultValue={cliente?.localidad ?? ""} />
          </Campo>
          <Campo label="Provincia">
            <Input name="provincia" defaultValue={cliente?.provincia ?? ""} />
          </Campo>
          <Campo label="Código postal">
            <Input name="codigoPostal" defaultValue={cliente?.codigoPostal ?? ""} />
          </Campo>
        </div>
      </Card>

      <Card title="Condiciones comerciales" descripcion="Valores por defecto para los servicios de este cliente">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Moneda">
            <Select name="moneda" defaultValue={cliente?.moneda ?? "PES"}>
              <option value="PES">Pesos</option>
              <option value="DOL">Dólares</option>
            </Select>
          </Campo>
          <Campo label="Días de vencimiento" ayuda="0 = contado">
            <Input
              name="diasVencimiento"
              type="number"
              min={0}
              defaultValue={cliente?.diasVencimiento ?? 0}
            />
          </Campo>
          <Campo label="Condición de venta">
            <Input
              name="condicionPago"
              placeholder="30 días fecha factura"
              defaultValue={cliente?.condicionPago ?? ""}
            />
          </Campo>
          <Campo label="Notas internas" className="sm:col-span-2 lg:col-span-3">
            <TextArea name="notas" rows={3} defaultValue={cliente?.notas ?? ""} />
          </Campo>
        </div>
      </Card>

      <div className="flex gap-2">
        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : cliente ? "Guardar cambios" : "Crear cliente"}
        </Boton>
        <Link
          href="/clientes"
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
