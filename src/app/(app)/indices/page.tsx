import { prisma, dec } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { puede } from "@/lib/session";
import { Boton, Campo, Card, Input, Tabla, Td, Th, TextArea, Titulo, Vacio } from "@/components/ui";
import { cargarValores, crearIndice, eliminarValor, sincronizarAction } from "./actions";
import { AccionesGlobales, FuenteForm } from "./FuenteIndice";

export const dynamic = "force-dynamic";

export default async function IndicesPage() {
  const sesion = await requerirSesion();
  const puedeEditar = puede(sesion.rol, "indices:escribir");

  const indices = await prisma.indice.findMany({
    include: {
      valores: { orderBy: { periodo: "desc" }, take: 18 },
      _count: { select: { servicios: true, valores: true } },
    },
    orderBy: { codigo: "asc" },
  });

  return (
    <>
      <Titulo descripcion="Los valores que usan los servicios para ajustar sus precios">
        Índices de ajuste
      </Titulo>

      {puedeEditar && (
        <div className="mb-4">
          <Card
            title="Actualización automática"
            descripcion="Los índices con origen configurado se traen solos del INDEC (apis.datos.gob.ar) o del BCRA"
          >
            <AccionesGlobales />
            <p className="mt-3 text-xs text-gray-500">
              Para que corra sin intervención, programá una llamada diaria a{" "}
              <code className="rounded bg-gray-100 px-1">/api/cron/indices</code> con el header{" "}
              <code className="rounded bg-gray-100 px-1">Authorization: Bearer $CRON_SECRET</code>.
            </p>
          </Card>
        </div>
      )}

      {puedeEditar && (
        <div className="mb-4">
          <Card title="Nuevo índice">
            <form action={crearIndice} className="flex flex-wrap items-end gap-3">
              <Campo label="Código" className="w-32">
                <Input name="codigo" placeholder="IPC" required />
              </Campo>
              <Campo label="Nombre" className="min-w-[220px] flex-1">
                <Input name="nombre" placeholder="Índice de Precios al Consumidor" required />
              </Campo>
              <Campo label="Fuente" className="w-48">
                <Input name="fuente" placeholder="INDEC" />
              </Campo>
              <Boton type="submit">Crear</Boton>
            </form>
          </Card>
        </div>
      )}

      {indices.length === 0 ? (
        <Card>
          <Vacio mensaje="Todavía no cargaste ningún índice" />
        </Card>
      ) : (
        <div className="space-y-4">
          {indices.map((i) => {
            const ultimo = i.valores[0];
            const anterior = i.valores[1];
            const variacion =
              ultimo && anterior ? (dec(ultimo.valor) / dec(anterior.valor) - 1) * 100 : null;

            return (
              <Card
                key={i.id}
                title={`${i.codigo} — ${i.nombre}`}
                descripcion={`${i._count.valores} períodos cargados · ${i._count.servicios} servicios lo usan${
                  i.fuente ? ` · fuente ${i.fuente}` : ""
                }`}
              >
                {puedeEditar && (
                  <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <FuenteForm
                      indiceId={i.id}
                      codigo={i.codigo}
                      fuenteTipo={i.fuenteTipo}
                      fuenteId={i.fuenteId}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {i.fuenteTipo !== "MANUAL" && (
                        <form action={sincronizarAction}>
                          <input type="hidden" name="indiceId" value={i.id} />
                          <button className="text-xs font-medium text-marca-600 hover:underline">
                            Sincronizar ahora
                          </button>
                        </form>
                      )}
                      {i.ultimaSync && (
                        <span className="text-[11px] text-gray-500">
                          Última sincronización: {i.ultimaSync.toLocaleString("es-AR")}
                        </span>
                      )}
                      {i.ultimoError && (
                        <span className="text-[11px] text-red-600">{i.ultimoError}</span>
                      )}
                    </div>
                  </div>
                )}

                {ultimo && (
                  <p className="mb-4 text-sm text-gray-700">
                    Último valor: <span className="tabular font-medium">{dec(ultimo.valor)}</span> (
                    {ultimo.periodo})
                    {variacion !== null && (
                      <span
                        className={`tabular ml-2 ${variacion >= 0 ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {variacion >= 0 ? "+" : ""}
                        {variacion.toFixed(2)}% vs período anterior
                      </span>
                    )}
                  </p>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    {i.valores.length === 0 ? (
                      <Vacio mensaje="Sin valores cargados" />
                    ) : (
                      <Tabla>
                        <thead>
                          <tr>
                            <Th>Período</Th>
                            <Th className="text-right">Valor</Th>
                            <Th className="text-right">Var.</Th>
                            {puedeEditar && <Th />}
                          </tr>
                        </thead>
                        <tbody>
                          {i.valores.map((v, idx) => {
                            const prev = i.valores[idx + 1];
                            const var2 = prev ? (dec(v.valor) / dec(prev.valor) - 1) * 100 : null;
                            return (
                              <tr key={v.id}>
                                <Td className="tabular">{v.periodo}</Td>
                                <Td className="tabular text-right">{dec(v.valor)}</Td>
                                <Td className="tabular text-right text-gray-500">
                                  {var2 === null ? "—" : `${var2 >= 0 ? "+" : ""}${var2.toFixed(2)}%`}
                                </Td>
                                {puedeEditar && (
                                  <Td className="text-right">
                                    <form action={eliminarValor}>
                                      <input type="hidden" name="valorId" value={v.id} />
                                      <button className="text-xs text-gray-400 hover:text-red-600">
                                        borrar
                                      </button>
                                    </form>
                                  </Td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </Tabla>
                    )}
                  </div>

                  {puedeEditar && (
                    <form action={cargarValores} className="space-y-3">
                      <input type="hidden" name="indiceId" value={i.id} />
                      <Campo
                        label="Cargar valores"
                        ayuda="Una línea por período: AAAA-MM y el valor. Si el período ya existe se actualiza."
                      >
                        <TextArea
                          name="valores"
                          rows={8}
                          placeholder={"2026-06 8123.45\n2026-07 8455.10\n2026-08 8790.22"}
                          className="font-mono text-xs"
                        />
                      </Campo>
                      <Boton variante="secundario" type="submit">
                        Guardar valores
                      </Boton>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
