import type { ZodError } from "zod";

/**
 * Convierte los errores de Zod en algo legible en pantalla, con el nombre del
 * campo adelante. Sin eso, un mensaje como "expected number, received NaN" no
 * dice en cuál de los veinte campos del formulario está el problema.
 */
export function mensajeDeError(error: ZodError): string {
  return error.issues
    .map((i) => {
      const campo = i.path.join(".");
      return campo ? `${campo}: ${i.message}` : i.message;
    })
    .join(" · ");
}
