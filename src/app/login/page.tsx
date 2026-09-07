"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { accionLogin } from "./actions";
import { Alerta, Boton, Campo, Input } from "@/components/ui";

function Formulario() {
  const params = useSearchParams();
  const [estado, accion, pendiente] = useActionState(accionLogin, {} as { error?: string });

  return (
    <form action={accion} className="w-full max-w-sm space-y-4">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-marca-600 text-lg font-bold text-white">
          F
        </div>
        <h1 className="text-lg font-semibold text-gray-900">Facturador ARCA</h1>
        <p className="mt-1 text-sm text-gray-500">Ingresá con tu cuenta</p>
      </div>

      {estado?.error && <Alerta tono="error">{estado.error}</Alerta>}

      <input type="hidden" name="volver" value={params.get("volver") ?? "/"} />

      <Campo label="Email">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Campo>
      <Campo label="Contraseña">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Campo>

      <Boton type="submit" disabled={pendiente} className="w-full">
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <Suspense>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}
