import type { FuenteIndice } from "@prisma/client";

/**
 * Series conocidas para sugerir en la interfaz. Los ids del BCRA conviene
 * confirmarlos con el catálogo (botón "Ver catálogo del BCRA"): el organismo
 * los puede renumerar.
 */
export const SERIES_SUGERIDAS: {
  codigo: string;
  nombre: string;
  fuenteTipo: FuenteIndice;
  fuenteId: string;
  nota: string;
}[] = [
  {
    codigo: "IPC",
    nombre: "IPC nivel general — nacional",
    fuenteTipo: "DATOS_GOB",
    fuenteId: "148.3_INIVELNAL_DICI_M_26",
    nota: "Índice del INDEC, base diciembre 2016 = 100. Mensual.",
  },
  {
    codigo: "IPC_NUCLEO",
    nombre: "IPC núcleo — nacional",
    fuenteTipo: "DATOS_GOB",
    fuenteId: "148.3_INUCLEONAL_DICI_M_19",
    nota: "Variante que excluye estacionales y regulados.",
  },
  {
    codigo: "CER",
    nombre: "CER — Coeficiente de Estabilización de Referencia",
    fuenteTipo: "BCRA",
    fuenteId: "30",
    nota: "Serie diaria del BCRA. Confirmá el id con el catálogo.",
  },
  {
    codigo: "UVA",
    nombre: "UVA — Unidad de Valor Adquisitivo",
    fuenteTipo: "BCRA",
    fuenteId: "31",
    nota: "Serie diaria del BCRA. Confirmá el id con el catálogo.",
  },
  {
    codigo: "ICL",
    nombre: "ICL — Índice para Contratos de Locación",
    fuenteTipo: "BCRA",
    fuenteId: "40",
    nota: "Serie diaria del BCRA. Confirmá el id con el catálogo.",
  },
];
