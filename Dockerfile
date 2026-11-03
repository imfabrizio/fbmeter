# Immagine per qualsiasi host con Docker (Azure App Service / Container Apps, VM, NAS…).
# Le migrazioni del database vengono applicate a ogni avvio (sono idempotenti).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY next.config.ts ./
EXPOSE 3000
USER node
CMD ["sh", "-c", "node scripts/migrate.mjs && npx next start -p ${PORT}"]
