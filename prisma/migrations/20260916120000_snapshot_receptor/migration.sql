-- Datos del receptor que se congelan al emitir.
-- El PDF los imprime, así que una reimpresión no debe cambiar si el cliente
-- actualiza su domicilio o su email después de haber sido facturado.
-- Todas nulas: los comprobantes ya emitidos caen al dato vivo del cliente.

ALTER TABLE "Comprobante" ADD COLUMN "cliLocalidad" TEXT;
ALTER TABLE "Comprobante" ADD COLUMN "cliProvincia" TEXT;
ALTER TABLE "Comprobante" ADD COLUMN "cliEmail" TEXT;
ALTER TABLE "Comprobante" ADD COLUMN "cliCondicionPago" TEXT;
