# Facturador ARCA

Sistema de facturación electrónica para Argentina, pensado para **servicios recurrentes**:
clientes con contratos que se facturan por período y que ajustan por índice o por porcentaje.

Emite comprobantes reales contra los web services de ARCA (ex AFIP): **WSAA** para autenticar y
**WSFEv1** para solicitar el CAE.

## Qué incluye

| Módulo | Detalle |
|---|---|
| **Clientes** | ABM con datos fiscales (tipo y número de documento, condición frente al IVA), domicilio, contacto y condiciones comerciales por defecto. |
| **Servicios** | ABM por cliente: precio, alícuota de IVA, periodicidad de facturación, día de emisión, inicio/fin de contrato, condiciones comerciales y **regla de ajuste** (índice o porcentaje, con su propia periodicidad y tope opcional). |
| **Índices** | Carga de series (IPC, ICL, CER, UVA, paritarias o propias) por período `AAAA-MM`, con carga masiva por pegado. |
| **Facturación** | Corrida por período que genera los borradores, aplica los ajustes pendientes y agrupa los servicios de cada cliente en un comprobante. |
| **Control previo** | Pantalla de revisión con validaciones de nivel *error* y *advertencia*. Nada se envía a ARCA hasta aprobarlo. |
| **Comprobantes** | Facturas A/B/C, notas de crédito y de débito A/B/C. PDF con CAE y QR obligatorio. |
| **Usuarios** | Roles `ADMIN`, `FACTURADOR` y `LECTURA`, con auditoría de acciones. |
| **Tablero** | KPIs: facturado del mes y variación, MRR/ARR, IVA débito fiscal, ticket promedio, pendiente de emitir, servicios por facturar, ajustes pendientes, tasa de rechazo de ARCA, serie de 12 meses y top de clientes. |

## Tipos de comprobante

El tipo se determina solo, según la condición frente al IVA del emisor y del receptor:

| Emisor | Receptor | Comprobante |
|---|---|---|
| Responsable Inscripto | Responsable Inscripto | **Factura A** (IVA discriminado) |
| Responsable Inscripto | Monotributo / Exento / Consumidor Final | **Factura B** (IVA incluido) |
| Monotributo o Exento | cualquiera | **Factura C** (sin IVA discriminado) |

Las notas de crédito y débito conservan la letra de la factura que corrigen, y se envían a ARCA con
el comprobante asociado. Los códigos usados son los de WSFEv1: 1/2/3 (A), 6/7/8 (B), 11/12/13 (C).

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Prisma · PostgreSQL · Tailwind CSS 4 ·
pdfkit · node-forge (firma CMS del ticket de acceso).

## Puesta en marcha

```bash
cp .env.example .env          # completar DATABASE_URL, AUTH_SECRET y ENCRYPTION_KEY
npm install
npx prisma migrate dev        # crea el esquema
npm run db:seed               # usuario admin, empresa, punto de venta e índices
npm run dev
```

Generar los secretos:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY (64 caracteres hexadecimales)
```

Con Docker para la base:

```bash
docker compose up -d
```

## Conectar con ARCA

1. **Clave privada y CSR**

   ```bash
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout privada.key -out pedido.csr \
     -subj "/C=AR/O=TU RAZON SOCIAL/CN=facturador/serialNumber=CUIT 30000000007"
   ```

2. En el portal de ARCA, **Administración de Certificados Digitales**: subí el `.csr` y descargá el `.crt`.
3. En **Administrador de Relaciones de Clave Fiscal**: asociá el certificado al servicio
   *Facturación Electrónica (wsfe)*.
4. En **Regímenes de Facturación y Registración (REAR/RECE/RFI)**: dá de alta el punto de venta como
   *Factura Electrónica – Web Services*.
5. En la app, **Configuración**: cargá los datos de la empresa, pegá el `.crt` y la clave privada, y
   usá *Probar conexión* y *Sincronizar puntos de venta*.

El certificado y la clave se guardan **cifrados con AES-256-GCM** usando `ENCRYPTION_KEY`; la clave
maestra nunca queda en la base. El ticket de acceso se cachea 12 horas, como exige el WSAA.

> El ambiente se elige en Configuración. **Producción emite comprobantes reales**: un comprobante
> autorizado no se borra, se corrige con una nota de crédito. Conviene probar primero en
> homologación, que usa su propio certificado.

## Flujo de trabajo

1. **Clientes** → alta con CUIT y condición frente al IVA.
2. **Servicios** → precio, periodicidad y regla de ajuste.
3. **Índices** → cargar los valores del período (si hay servicios que ajustan por índice).
4. **Facturación → Nueva corrida** → genera los borradores del período y aplica los ajustes.
5. **Control previo** → revisar errores y advertencias, corregir, aprobar.
6. **Emitir a ARCA** → se pide el CAE comprobante por comprobante; el número lo asigna ARCA
   (`FECompUltimoAutorizado` + 1).
7. **PDF** → descarga con CAE, vencimiento y QR de verificación.

## Validaciones del control previo

**Errores** (bloquean la emisión): certificado ausente o vencido, CUIT inválido del emisor o del
receptor, factura A a un receptor que no es Responsable Inscripto, comprobante sin ítems, total
menor o igual a cero, descuadre entre ítems y total o entre subtotales de IVA e IVA total, IVA
discriminado en un comprobante C, falta del período de servicio, consumidor final sin identificar
por encima del monto permitido, nota de crédito sobre un comprobante no autorizado o de otra letra,
o por un importe mayor al original.

**Advertencias** (no bloquean): cliente sin email de facturación, fecha de emisión fuera del margen
que acepta ARCA (5 días para productos, 10 para servicios), comprobante duplicado para el mismo
cliente y período, nota sin motivo.

## Estructura

```
prisma/schema.prisma          modelo de datos
src/lib/arca/wsaa.ts          ticket de acceso: TRA, firma CMS y cache
src/lib/arca/wsfev1.ts        SOAP de facturación: FECAESolicitar y padrones
src/lib/fiscal.ts             tablas de ARCA, tipos de comprobante y cálculo de IVA
src/lib/ajustes.ts            motor de ajuste por índice y periodicidad
src/lib/facturacion.ts        corrida, control previo y emisión
src/lib/pdf.ts                PDF del comprobante con QR
src/lib/kpi.ts                indicadores del tablero
src/app/(app)/...             pantallas
```

## Pendientes conocidos

- Envío automático de la factura por email al cliente.
- Percepciones y otros tributos (el modelo ya tiene `importeTributos`, falta la carga).
- Facturas M y de exportación (E) — la estructura está, falta la pantalla.
- Conciliación de cobranzas.
