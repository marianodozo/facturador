import { prisma } from "@/lib/db";
import { requerirPermiso } from "@/lib/auth";
import { NOMBRE_ROL, PERMISOS } from "@/lib/session";
import { Badge, Card, Tabla, Td, Th, Titulo } from "@/components/ui";
import { UsuarioForm } from "./UsuarioForm";
import { alternarUsuarioActivo } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sesion = await requerirPermiso("usuarios:leer");

  const [usuarios, auditoria] = await Promise.all([
    prisma.usuario.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.auditoria.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { usuario: { select: { nombre: true } } },
    }),
  ]);

  return (
    <>
      <Titulo descripcion="Quién puede entrar y qué puede hacer">Usuarios</Titulo>

      <div className="mb-4">
        <UsuarioForm />
      </div>

      <div className="mb-4">
        <Card title="Usuarios del sistema">
          <Tabla>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th>Rol</Th>
                <Th>Último acceso</Th>
                <Th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={u.activo ? "" : "opacity-50"}>
                  <Td className="font-medium">
                    {u.nombre}
                    {u.id === sesion.sub && (
                      <span className="ml-2">
                        <Badge tono="azul">vos</Badge>
                      </span>
                    )}
                  </Td>
                  <Td className="text-gray-600">{u.email}</Td>
                  <Td>
                    <Badge tono={u.rol === "ADMIN" ? "violeta" : u.rol === "FACTURADOR" ? "azul" : "gris"}>
                      {NOMBRE_ROL[u.rol]}
                    </Badge>
                  </Td>
                  <Td className="tabular text-gray-500">
                    {u.ultimoAcceso?.toLocaleString("es-AR") ?? "nunca"}
                  </Td>
                  <Td className="text-right">
                    {u.id !== sesion.sub && (
                      <form action={alternarUsuarioActivo}>
                        <input type="hidden" name="usuarioId" value={u.id} />
                        <button className="text-sm text-gray-500 hover:text-marca-700">
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        {(["ADMIN", "FACTURADOR", "LECTURA"] as const).map((rol) => (
          <Card key={rol} title={NOMBRE_ROL[rol]}>
            <ul className="space-y-1 text-xs text-gray-600">
              {PERMISOS[rol].map((p) => (
                <li key={p}>{p.replace(":", " · ")}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card title="Auditoría reciente" descripcion="Últimas 30 acciones registradas">
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Usuario</Th>
              <Th>Acción</Th>
              <Th>Entidad</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {auditoria.map((a) => (
              <tr key={a.id}>
                <Td className="tabular text-gray-500">{a.createdAt.toLocaleString("es-AR")}</Td>
                <Td className="text-gray-700">{a.usuario?.nombre ?? "—"}</Td>
                <Td className="text-gray-600">{a.accion}</Td>
                <Td className="text-gray-600">{a.entidad}</Td>
                <Td className="tabular text-xs text-gray-400">{a.ip ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Card>
    </>
  );
}
