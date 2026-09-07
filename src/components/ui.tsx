import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({
  title,
  descripcion,
  acciones,
  children,
  className = "",
}: {
  title?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {(title || acciones) && (
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
            {descripcion && <p className="mt-0.5 text-xs text-gray-500">{descripcion}</p>}
          </div>
          {acciones && <div className="flex shrink-0 gap-2">{acciones}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const VARIANTES = {
  primario: "bg-marca-600 text-white hover:bg-marca-700",
  secundario: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
  peligro: "bg-red-600 text-white hover:bg-red-700",
  fantasma: "text-gray-600 hover:bg-gray-100",
} as const;

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<"button"> & { variante?: keyof typeof VARIANTES }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
    />
  );
}

export function BotonLink({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: keyof typeof VARIANTES }) {
  return (
    <Link
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${VARIANTES[variante]} ${className}`}
    />
  );
}

export function Campo({
  label,
  ayuda,
  children,
  className = "",
}: {
  label: string;
  ayuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-gray-500">{ayuda}</span>}
    </label>
  );
}

const INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100 disabled:bg-gray-50";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${INPUT} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${INPUT} ${className}`} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${INPUT} ${className}`} />;
}

const TONOS = {
  gris: "bg-gray-100 text-gray-700",
  verde: "bg-emerald-100 text-emerald-800",
  ambar: "bg-amber-100 text-amber-800",
  rojo: "bg-red-100 text-red-800",
  azul: "bg-blue-100 text-blue-800",
  violeta: "bg-violet-100 text-violet-800",
} as const;

export function Badge({
  tono = "gris",
  children,
}: {
  tono?: keyof typeof TONOS;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`border-b border-gray-200 pb-2 text-xs font-medium text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b border-gray-100 py-2.5 text-gray-800 ${className}`}>{children}</td>;
}

export function Vacio({ mensaje, accion }: { mensaje: string; accion?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center">
      <p className="text-sm text-gray-500">{mensaje}</p>
      {accion && <div className="mt-3 flex justify-center">{accion}</div>}
    </div>
  );
}

export function Alerta({
  tono = "info",
  children,
}: {
  tono?: "info" | "error" | "exito" | "aviso";
  children: ReactNode;
}) {
  const estilos = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    error: "border-red-200 bg-red-50 text-red-900",
    exito: "border-emerald-200 bg-emerald-50 text-emerald-900",
    aviso: "border-amber-200 bg-amber-50 text-amber-900",
  }[tono];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${estilos}`}>{children}</div>;
}

export function Titulo({
  children,
  descripcion,
  acciones,
}: {
  children: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{children}</h1>
        {descripcion && <p className="mt-1 text-sm text-gray-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex gap-2">{acciones}</div>}
    </div>
  );
}
