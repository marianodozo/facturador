"use client";

import { useActionState } from "react";
import { guardarUsuario, type EstadoForm } from "./actions";
import { Alerta, Boton, Campo, Card, Input, Select } from "@/components/ui";

export function UsuarioForm() {
  const [estado, accion, pendiente] = useActionState(guardarUsuario, {} as EstadoForm);

  return (
    <Card title="Nuevo usuario" descripcion="El rol define qué puede hacer dentro del sistema">
      <form action={accion} className="space-y-4">
        {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}
        {estado?.ok && <Alerta tono="exito">{estado.ok}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Nombre">
            <Input name="nombre" required />
          </Campo>
          <Campo label="Email">
            <Input name="email" type="email" required />
          </Campo>
          <Campo label="Rol">
            <Select name="rol" defaultValue="LECTURA">
              <option value="ADMIN">Administrador — todo, incluido usuarios y config</option>
              <option value="FACTURADOR">Facturador — ABM y emisión de comprobantes</option>
              <option value="LECTURA">Solo lectura — consulta y descarga de PDF</option>
            </Select>
          </Campo>
          <Campo label="Contraseña inicial" ayuda="Mínimo 8 caracteres">
            <Input name="password" type="password" minLength={8} required />
          </Campo>
        </div>

        <Boton type="submit" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear usuario"}
        </Boton>
      </form>
    </Card>
  );
}
