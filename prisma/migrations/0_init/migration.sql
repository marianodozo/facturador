-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'FACTURADOR', 'LECTURA');

-- CreateEnum
CREATE TYPE "CondicionIVA" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL', 'NO_CATEGORIZADO', 'MONOTRIBUTO_SOCIAL', 'IVA_LIBERADO', 'NO_ALCANZADO');

-- CreateEnum
CREATE TYPE "AmbienteArca" AS ENUM ('HOMOLOGACION', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CUIT', 'CUIL', 'DNI', 'PASAPORTE', 'CDI', 'SIN_IDENTIFICAR');

-- CreateEnum
CREATE TYPE "FuenteIndice" AS ENUM ('MANUAL', 'DATOS_GOB', 'BCRA');

-- CreateEnum
CREATE TYPE "Periodicidad" AS ENUM ('MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'CUATRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'UNICA');

-- CreateEnum
CREATE TYPE "TipoAjuste" AS ENUM ('NINGUNO', 'INDICE', 'PORCENTAJE_FIJO');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'FACTURA_M', 'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C', 'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('BORRADOR', 'OBSERVADO', 'APROBADO', 'AUTORIZADO', 'RECHAZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoCorrida" AS ENUM ('ABIERTA', 'EN_REVISION', 'EMITIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'LECTURA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcceso" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "cuit" TEXT NOT NULL,
    "condicionIVA" "CondicionIVA" NOT NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
    "ingresosBrutos" TEXT,
    "inicioActividades" TIMESTAMP(3),
    "domicilio" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "web" TEXT,
    "logoBase64" TEXT,
    "arcaAmbiente" "AmbienteArca" NOT NULL DEFAULT 'PRODUCCION',
    "arcaCertEncrypted" TEXT,
    "arcaKeyEncrypted" TEXT,
    "arcaCertVencimiento" TIMESTAMP(3),
    "arcaCertSubject" TEXT,
    "arcaUltimaConexion" TIMESTAMP(3),
    "arcaUltimoError" TEXT,
    "ptoVtaDefault" INTEGER NOT NULL DEFAULT 1,
    "conceptoDefault" INTEGER NOT NULL DEFAULT 2,
    "diasVtoPagoDefault" INTEGER NOT NULL DEFAULT 0,
    "leyendaPie" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 587,
    "smtpSeguro" BOOLEAN NOT NULL DEFAULT false,
    "smtpUsuario" TEXT,
    "smtpPassEncrypted" TEXT,
    "emailRemitente" TEXT,
    "emailCopia" TEXT,
    "enviarEmailAuto" BOOLEAN NOT NULL DEFAULT false,
    "asuntoEmail" TEXT,
    "cuerpoEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoVenta" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuntoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAcceso" (
    "id" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "ambiente" "AmbienteArca" NOT NULL,
    "token" TEXT NOT NULL,
    "sign" TEXT NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'CUIT',
    "numeroDocumento" TEXT NOT NULL,
    "condicionIVA" "CondicionIVA" NOT NULL,
    "email" TEXT,
    "emailFacturacion" TEXT,
    "telefono" TEXT,
    "contacto" TEXT,
    "domicilio" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'Argentina',
    "moneda" TEXT NOT NULL DEFAULT 'PES',
    "diasVencimiento" INTEGER NOT NULL DEFAULT 0,
    "condicionPago" TEXT,
    "percepcionIIBB" DECIMAL(5,2),
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indice" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "fuente" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuenteTipo" "FuenteIndice" NOT NULL DEFAULT 'MANUAL',
    "fuenteId" TEXT,
    "ultimaSync" TIMESTAMP(3),
    "ultimoError" TEXT,

    CONSTRAINT "Indice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndiceValor" (
    "id" TEXT NOT NULL,
    "indiceId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndiceValor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servicio" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "moneda" TEXT NOT NULL DEFAULT 'PES',
    "precioBase" DECIMAL(18,2) NOT NULL,
    "precioActual" DECIMAL(18,2) NOT NULL,
    "alicuotaIVA" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "cantidad" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unidad" TEXT NOT NULL DEFAULT 'Unidad',
    "periodicidadFacturacion" "Periodicidad" NOT NULL DEFAULT 'MENSUAL',
    "diaFacturacion" INTEGER NOT NULL DEFAULT 1,
    "facturaPorAdelantado" BOOLEAN NOT NULL DEFAULT true,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "proximaFacturacion" TIMESTAMP(3) NOT NULL,
    "ultimaFacturacion" TIMESTAMP(3),
    "tipoAjuste" "TipoAjuste" NOT NULL DEFAULT 'NINGUNO',
    "indiceId" TEXT,
    "periodicidadAjuste" "Periodicidad",
    "ajustePorcentaje" DECIMAL(6,2),
    "periodoBaseIndice" TEXT,
    "proximoAjuste" TIMESTAMP(3),
    "ultimoAjuste" TIMESTAMP(3),
    "topeAjustePorc" DECIMAL(6,2),
    "diasVencimiento" INTEGER NOT NULL DEFAULT 0,
    "condicionPago" TEXT,
    "ordenCompra" TEXT,
    "centroCosto" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteServicio" (
    "id" TEXT NOT NULL,
    "servicioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "precioAnterior" DECIMAL(18,2) NOT NULL,
    "precioNuevo" DECIMAL(18,2) NOT NULL,
    "coeficiente" DECIMAL(12,6) NOT NULL,
    "origen" TEXT NOT NULL,
    "indiceCodigo" TEXT,
    "periodoDesde" TEXT,
    "periodoHasta" TEXT,
    "motivo" TEXT,
    "usuarioId" TEXT,

    CONSTRAINT "AjusteServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorridaFacturacion" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoCorrida" NOT NULL DEFAULT 'ABIERTA',
    "fechaEmision" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorridaFacturacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'BORRADOR',
    "ptoVtaId" INTEGER NOT NULL,
    "numero" INTEGER,
    "clienteId" TEXT NOT NULL,
    "corridaId" TEXT,
    "cliRazonSocial" TEXT NOT NULL,
    "cliTipoDoc" "TipoDocumento" NOT NULL,
    "cliNroDoc" TEXT NOT NULL,
    "cliCondicionIVA" "CondicionIVA" NOT NULL,
    "cliDomicilio" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "fechaVtoPago" TIMESTAMP(3),
    "concepto" INTEGER NOT NULL DEFAULT 2,
    "servicioDesde" TIMESTAMP(3),
    "servicioHasta" TIMESTAMP(3),
    "periodo" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'PES',
    "cotizacion" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "importeNeto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importeNoGravado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importeExento" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importeIVA" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importeTributos" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "importeTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cae" TEXT,
    "caeVencimiento" TIMESTAMP(3),
    "resultadoArca" TEXT,
    "observaciones" JSONB,
    "errores" JSONB,
    "enviadoAt" TIMESTAMP(3),
    "comprobanteAsociadoId" TEXT,
    "motivoNota" TEXT,
    "validaciones" JSONB,
    "revisadoAt" TIMESTAMP(3),
    "emailEnviadoAt" TIMESTAMP(3),
    "emailDestino" TEXT,
    "emailError" TEXT,
    "createdById" TEXT,
    "autorizadoById" TEXT,
    "autorizadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteItem" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "servicioId" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unidad" TEXT NOT NULL DEFAULT 'Unidad',
    "precioUnitario" DECIMAL(18,4) NOT NULL,
    "bonificacion" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "alicuotaIVA" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "importeNeto" DECIMAL(18,2) NOT NULL,
    "importeIVA" DECIMAL(18,2) NOT NULL,
    "importeTotal" DECIMAL(18,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComprobanteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteIVA" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "alicuotaId" INTEGER NOT NULL,
    "alicuota" DECIMAL(5,2) NOT NULL,
    "baseImponible" DECIMAL(18,2) NOT NULL,
    "importe" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ComprobanteIVA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_rol_activo_idx" ON "Usuario"("rol", "activo");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Auditoria_createdAt_idx" ON "Auditoria"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PuntoVenta_numero_key" ON "PuntoVenta"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAcceso_servicio_ambiente_key" ON "TicketAcceso"("servicio", "ambiente");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_codigo_key" ON "Cliente"("codigo");

-- CreateIndex
CREATE INDEX "Cliente_activo_idx" ON "Cliente"("activo");

-- CreateIndex
CREATE INDEX "Cliente_razonSocial_idx" ON "Cliente"("razonSocial");

-- CreateIndex
CREATE UNIQUE INDEX "Indice_codigo_key" ON "Indice"("codigo");

-- CreateIndex
CREATE INDEX "IndiceValor_periodo_idx" ON "IndiceValor"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "IndiceValor_indiceId_periodo_key" ON "IndiceValor"("indiceId", "periodo");

-- CreateIndex
CREATE INDEX "Servicio_clienteId_activo_idx" ON "Servicio"("clienteId", "activo");

-- CreateIndex
CREATE INDEX "Servicio_proximaFacturacion_idx" ON "Servicio"("proximaFacturacion");

-- CreateIndex
CREATE INDEX "AjusteServicio_servicioId_fecha_idx" ON "AjusteServicio"("servicioId", "fecha");

-- CreateIndex
CREATE INDEX "CorridaFacturacion_periodo_idx" ON "CorridaFacturacion"("periodo");

-- CreateIndex
CREATE INDEX "Comprobante_clienteId_fechaEmision_idx" ON "Comprobante"("clienteId", "fechaEmision");

-- CreateIndex
CREATE INDEX "Comprobante_estado_idx" ON "Comprobante"("estado");

-- CreateIndex
CREATE INDEX "Comprobante_periodo_idx" ON "Comprobante"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_tipo_ptoVtaId_numero_key" ON "Comprobante"("tipo", "ptoVtaId", "numero");

-- CreateIndex
CREATE INDEX "ComprobanteItem_comprobanteId_idx" ON "ComprobanteItem"("comprobanteId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteIVA_comprobanteId_alicuotaId_key" ON "ComprobanteIVA"("comprobanteId", "alicuotaId");

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndiceValor" ADD CONSTRAINT "IndiceValor_indiceId_fkey" FOREIGN KEY ("indiceId") REFERENCES "Indice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servicio" ADD CONSTRAINT "Servicio_indiceId_fkey" FOREIGN KEY ("indiceId") REFERENCES "Indice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteServicio" ADD CONSTRAINT "AjusteServicio_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteServicio" ADD CONSTRAINT "AjusteServicio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorridaFacturacion" ADD CONSTRAINT "CorridaFacturacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_ptoVtaId_fkey" FOREIGN KEY ("ptoVtaId") REFERENCES "PuntoVenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_corridaId_fkey" FOREIGN KEY ("corridaId") REFERENCES "CorridaFacturacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_comprobanteAsociadoId_fkey" FOREIGN KEY ("comprobanteAsociadoId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_autorizadoById_fkey" FOREIGN KEY ("autorizadoById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteItem" ADD CONSTRAINT "ComprobanteItem_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteItem" ADD CONSTRAINT "ComprobanteItem_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "Servicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteIVA" ADD CONSTRAINT "ComprobanteIVA_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

