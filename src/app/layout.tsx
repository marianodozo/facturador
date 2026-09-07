import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facturador ARCA",
  description: "Facturación electrónica de servicios recurrentes con integración a ARCA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
