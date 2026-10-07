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
| **Índices** | Series (IPC, ICL, CER, UVA, paritarias o propias) por período `AAAA-MM`. Carga manual masiva por pegado **o actualización automática** desde apis.datos.gob.ar (INDEC) y api.bcra.gob.ar. |
| **Email** | Envío del comprobante con el PDF adjunto al email de facturación del cliente, manual o automático al autorizar, con asunto y cuerpo configurables. |
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

## Despliegue

El `docker-compose.yml` levanta la app y su Postgres. La app escucha sólo en
`127.0.0.1:8091` y espera quedar detrás de un reverse proxy que termine TLS; la base no
se expone al exterior.

```bash
cp .env.example .env
docker compose build
docker compose up -d
docker compose exec facturador npx prisma db seed   # sólo la primera vez
```

El contenedor aplica las migraciones pendientes al arrancar. Para actualizar:
`git pull && docker compose build && docker compose up -d`.

El compose declara la red `proxy` como **externa**, apuntando a la red donde vive el
reverse proxy. Si en tu instalación el proxy corre en otro lado, cambiá ese nombre o
sacá el bloque `networks` y publicá el puerto como prefieras.

Cada build deja una capa de imagen de casi 1 GB, así que el disco se llena solo con el
tiempo. Conviene limpiar cada tanto:

```bash
docker builder prune -af
docker image prune -f
```

**Nunca** uses `docker system prune -a --volumes`: ese `--volumes` borra el volumen de
la base, con todos los comprobantes emitidos adentro.

## Backups

Esto guarda comprobantes fiscales: ARCA confirma los CAE, pero no te devuelve tus datos.
Un backup diario fuera de la máquina no es opcional.

```bash
docker compose exec -T db pg_dump -U facturador -d facturador --clean --if-exists \
  | gzip -9 > facturador-$(date +%F).sql.gz
```

Dos cosas que conviene no saltear:

- **Verificar el dump antes de darlo por bueno.** Que descomprima (`gzip -t`) y que
  contenga las tablas esperadas. Un backup que falla en silencio es peor que ninguno,
  porque da confianza falsa.
- **Guardar `ENCRYPTION_KEY` en otro lado**, no junto al backup. Es la clave que descifra
  el certificado de ARCA guardado en la base; si están juntas, un solo incidente se lleva
  las dos mitades.

Para restaurar: base vacía, `gunzip -c backup.sql.gz | psql`, y levantar la app. Las
migraciones no hace falta correrlas, el dump trae el esquema y el historial.

Y probá la restauración una vez, sobre una base descartable. Un backup que nunca se
restauró es una hipótesis.

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

## Actualización automática de índices

Cada índice puede tener un origen:

| Origen | Endpoint | Sirve para |
|---|---|---|
| `DATOS_GOB` | `apis.datos.gob.ar/series` | IPC del INDEC y demás series del Estado. Id de ejemplo: `148.3_INIVELNAL_DICI_M_26`. |
| `BCRA` | `api.bcra.gob.ar/estadisticas/v3.0/monetarias` | CER, UVA, ICL. El id es numérico. |
| `MANUAL` | — | Paritarias o índices propios. |

Las series diarias (CER, UVA, ICL) se consolidan a un valor por mes tomando el **último día con
dato** de cada mes. En cada sincronización se piden también los 6 meses anteriores al último dato
guardado, porque las fuentes a veces revisan valores publicados.

Los ids numéricos del BCRA los renumera el organismo: en la pantalla de Índices, el botón
**Ver catálogo del BCRA** lista las variables disponibles con su id actual, así no hay que adivinar.
Conviene confirmarlos la primera vez.

Para que corra sola, programá una llamada diaria:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/indices
```

En Vercel ya está el cron en `vercel.json` (todos los días a las 12 UTC).

## Envío por email

En **Configuración → Envío de comprobantes por email** se cargan host, puerto, usuario y contraseña
del SMTP (la contraseña se guarda cifrada, igual que la clave de ARCA), el remitente y una copia
oculta opcional. Con *Enviar al autorizar* tildado, cada comprobante que recibe CAE sale solo al
email de facturación del cliente. Si el envío falla, el comprobante queda autorizado igual y el
error se muestra en su ficha para reintentar.

El asunto y el cuerpo aceptan variables: `{comprobante}`, `{numero}`, `{empresa}`, `{cliente}`,
`{total}`, `{periodo}`, `{vencimiento}`, `{cae}`.

## Pendientes conocidos

- Percepciones y otros tributos (el modelo ya tiene `importeTributos`, falta la carga).
- Facturas M y de exportación (E) — la estructura está, falta la pantalla.
- Conciliación de cobranzas.
