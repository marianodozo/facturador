/**
 * Reparte los servicios de una corrida en comprobantes.
 *
 * Cada servicio va en su propia factura. La excepción son los clientes
 * marcados con `agruparEnUnaFactura`, que reciben un único comprobante con
 * todos sus servicios del período como ítems.
 *
 * Está aparte de la corrida para poder probarlo sin base de datos.
 */
export interface ServicioAgrupable {
  clienteId: string;
  cliente: { agruparEnUnaFactura: boolean };
}

export function agruparServicios<T extends ServicioAgrupable>(servicios: T[]): T[][] {
  const grupos: T[][] = [];
  const abiertos = new Map<string, T[]>();

  for (const s of servicios) {
    if (!s.cliente.agruparEnUnaFactura) {
      grupos.push([s]);
      continue;
    }
    const abierto = abiertos.get(s.clienteId);
    if (abierto) {
      abierto.push(s);
    } else {
      const nuevo = [s];
      abiertos.set(s.clienteId, nuevo);
      grupos.push(nuevo);
    }
  }

  return grupos;
}
