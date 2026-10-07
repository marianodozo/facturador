-- Cada servicio pasa a facturarse por separado.
-- Los clientes que prefieran un único comprobante con todos sus servicios
-- se marcan a mano; por eso el default es false.

ALTER TABLE "Cliente" ADD COLUMN "agruparEnUnaFactura" BOOLEAN NOT NULL DEFAULT false;
