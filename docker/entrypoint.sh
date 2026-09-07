#!/bin/sh
set -e

echo "→ Aplicando migraciones pendientes…"
npx prisma migrate deploy

echo "→ Levantando el facturador en el puerto ${PORT:-8091}"
exec node_modules/.bin/next start -p "${PORT:-8091}" -H 0.0.0.0
