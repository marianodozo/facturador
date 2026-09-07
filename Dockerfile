# Imagen de producción del facturador.
# Multi-stage: se compila con todas las dependencias y la imagen final se queda
# con lo necesario para correr, incluido el CLI de Prisma para las migraciones.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# openssl lo necesita el motor de Prisma
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- dependencias ---------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- compilación ----------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Techo de memoria para que el build no se lleve puesta una instancia chica
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

# --- runtime --------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8091

COPY --from=deps  /app/node_modules            ./node_modules
COPY --from=build /app/node_modules/.prisma    ./node_modules/.prisma
COPY --from=build /app/.next                   ./.next
COPY --from=build /app/package.json            ./package.json
COPY --from=build /app/next.config.ts          ./next.config.ts
COPY --from=build /app/prisma                  ./prisma
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh && chown -R node:node /app
USER node

EXPOSE 8091
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
