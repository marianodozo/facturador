import type { AmbienteArca } from "@prisma/client";

export const ENDPOINTS: Record<AmbienteArca, { wsaa: string; wsfev1: string }> = {
  PRODUCCION: {
    wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
    wsfev1: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
  },
  HOMOLOGACION: {
    wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfev1: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  },
};

/** URL pública del validador de comprobantes (para el QR del PDF). */
export const URL_QR = "https://www.afip.gob.ar/fe/qr/?p=";

export const SERVICIO_WSFE = "wsfe";

export class ErrorArca extends Error {
  constructor(
    message: string,
    public readonly codigo?: string | number,
    public readonly detalle?: unknown,
  ) {
    super(message);
    this.name = "ErrorArca";
  }
}
