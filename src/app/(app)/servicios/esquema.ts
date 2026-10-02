import { z } from "zod";

/**
 * Validación del formulario de servicios.
 *
 * Vive aparte de las server actions para poder probarla sola: un archivo
 * "use server" sólo puede exportar funciones asíncronas.
 */

export const PERIODICIDADES = [
  "MENSUAL",
  "BIMESTRAL",
  "TRIMESTRAL",
  "CUATRIMESTRAL",
  "SEMESTRAL",
  "ANUAL",
  "UNICA",
] as const;

export const esquemaServicio = z.object({
  clienteId: z.string().min(1, "Elegí un cliente"),
  nombre: z.string().trim().min(2, "El nombre del servicio es obligatorio"),
  descripcion: z.string().trim().optional(),
  moneda: z.enum(["PES", "DOL"]),
  // Sólo se carga en el alta: al editar, el campo viene deshabilitado y no se envía.
  precioBase: z.coerce.number().positive("El precio debe ser mayor a cero").optional(),
  alicuotaIVA: z.coerce.number("Elegí una alícuota de IVA"),
  cantidad: z.coerce.number("La cantidad tiene que ser un número").positive("La cantidad debe ser mayor a cero"),
  unidad: z.string().trim().default("Unidad"),
  periodicidadFacturacion: z.enum(PERIODICIDADES),
  diaFacturacion: z.coerce
    .number("El día de facturación tiene que ser un número")
    .int()
    .min(1, "El día de facturación va del 1 al 28")
    .max(28, "El día de facturación va del 1 al 28"),
  facturaPorAdelantado: z.coerce.boolean(),
  fechaInicio: z.string().min(1, "Indicá la fecha de inicio"),
  fechaFin: z.string().optional(),
  proximaFacturacion: z.string().optional(),
  tipoAjuste: z.enum(["NINGUNO", "INDICE", "PORCENTAJE_FIJO"]),
  indiceId: z.string().optional(),
  periodicidadAjuste: z.string().optional(),
  ajustePorcentaje: z.string().optional(),
  periodoBaseIndice: z.string().optional(),
  topeAjustePorc: z.string().optional(),
  diasVencimiento: z.coerce
    .number("Los días de vencimiento tienen que ser un número")
    .int()
    .min(0, "Los días de vencimiento no pueden ser negativos")
    .max(365, "Los días de vencimiento no pueden superar 365"),
  condicionPago: z.string().trim().optional(),
  ordenCompra: z.string().trim().optional(),
  centroCosto: z.string().trim().optional(),
  notas: z.string().trim().optional(),
  activo: z.coerce.boolean(),
});

export type DatosServicio = z.infer<typeof esquemaServicio>;
