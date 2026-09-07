"use client";

import { useState, useTransition } from "react";
import { configurarFuente, sincronizarTodosAction, verCatalogoBcra } from "./actions";
import { SERIES_SUGERIDAS } from "@/lib/indices/series";
import { Alerta, Boton, Campo, Input, Select } from "@/components/ui";

export function FuenteForm({
  indiceId,
  codigo,
  fuenteTipo,
  fuenteId,
}: {
  indiceId: string;
  codigo: string;
  fuenteTipo: string;
  fuenteId: string | null;
}) {
  const [tipo, setTipo] = useState(fuenteTipo);
  const sugerida = SERIES_SUGERIDAS.find((s) => s.codigo === codigo);

  return (
    <form action={configurarFuente} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="indiceId" value={indiceId} />
      <Campo label="Origen de los datos">
        <Select name="fuenteTipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="MANUAL">Carga manual</option>
          <option value="DATOS_GOB">apis.datos.gob.ar (INDEC)</option>
          <option value="BCRA">api.bcra.gob.ar (CER, UVA, ICL)</option>
        </Select>
      </Campo>
      {tipo !== "MANUAL" && (
        <Campo
          label="Id de la serie"
          ayuda={sugerida ? `Sugerido: ${sugerida.fuenteId} — ${sugerida.nota}` : undefined}
        >
          <Input
            name="fuenteId"
            defaultValue={fuenteId ?? sugerida?.fuenteId ?? ""}
            placeholder={tipo === "BCRA" ? "30" : "148.3_INIVELNAL_DICI_M_26"}
          />
        </Campo>
      )}
      <div className="flex items-end">
        <Boton variante="secundario" type="submit">
          Guardar origen
        </Boton>
      </div>
    </form>
  );
}

export function AccionesGlobales() {
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [enCurso, start] = useTransition();

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Boton
          variante="secundario"
          disabled={enCurso}
          onClick={() =>
            start(async () => {
              const r = await sincronizarTodosAction();
              setMsg({
                ok: r.length ? r.map((x) => x.mensaje).join("\n") : "No hay índices automáticos configurados",
              });
            })
          }
        >
          {enCurso ? "Sincronizando…" : "Sincronizar todos ahora"}
        </Boton>
        <Boton
          variante="secundario"
          disabled={enCurso}
          onClick={() => start(async () => setMsg(await verCatalogoBcra()))}
        >
          Ver catálogo del BCRA
        </Boton>
      </div>

      {msg?.ok && (
        <div className="mt-3">
          <Alerta tono="exito">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
              {msg.ok}
            </pre>
          </Alerta>
        </div>
      )}
      {msg?.error && (
        <div className="mt-3">
          <Alerta tono="error">{msg.error}</Alerta>
        </div>
      )}
    </div>
  );
}
