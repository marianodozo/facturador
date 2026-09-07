import { requerirPermiso } from "@/lib/auth";
import { Titulo } from "@/components/ui";
import { ClienteForm } from "../ClienteForm";

export default async function NuevoClientePage() {
  await requerirPermiso("clientes:escribir");
  return (
    <>
      <Titulo descripcion="Los datos fiscales determinan qué tipo de comprobante se le emite">
        Nuevo cliente
      </Titulo>
      <ClienteForm />
    </>
  );
}
