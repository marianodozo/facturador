import { redirect } from "next/navigation";
import { cerrarSesion, requerirSesion } from "@/lib/auth";
import { NOMBRE_ROL } from "@/lib/session";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();

  async function salir() {
    "use server";
    await cerrarSesion();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca-600 text-sm font-bold text-white">
            F
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Facturador</p>
            <p className="text-[11px] text-gray-500">ARCA · Argentina</p>
          </div>
        </div>

        <Nav rol={sesion.rol} />

        <div className="mt-auto border-t border-gray-100 pt-3">
          <p className="truncate px-3 text-sm font-medium text-gray-800">{sesion.nombre}</p>
          <p className="truncate px-3 text-[11px] text-gray-500">{NOMBRE_ROL[sesion.rol]}</p>
          <form action={salir}>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
