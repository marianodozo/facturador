"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@prisma/client";

const ITEMS: { href: string; label: string; roles: Rol[] }[] = [
  { href: "/", label: "Tablero", roles: ["ADMIN", "FACTURADOR", "LECTURA"] },
  { href: "/clientes", label: "Clientes", roles: ["ADMIN", "FACTURADOR", "LECTURA"] },
  { href: "/servicios", label: "Servicios", roles: ["ADMIN", "FACTURADOR", "LECTURA"] },
  { href: "/facturacion", label: "Facturación", roles: ["ADMIN", "FACTURADOR"] },
  { href: "/comprobantes", label: "Comprobantes", roles: ["ADMIN", "FACTURADOR", "LECTURA"] },
  { href: "/indices", label: "Índices", roles: ["ADMIN", "FACTURADOR", "LECTURA"] },
  { href: "/configuracion", label: "Configuración", roles: ["ADMIN", "FACTURADOR"] },
  { href: "/usuarios", label: "Usuarios", roles: ["ADMIN"] },
];

export function Nav({ rol }: { rol: Rol }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {ITEMS.filter((i) => i.roles.includes(rol)).map((item) => {
        const activo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-lg px-3 py-2 text-sm transition ${
              activo
                ? "bg-marca-50 font-medium text-marca-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
