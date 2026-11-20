# Imagen de PRODUCCIÓN de la API (docker-compose.prod.yml). Tres objetivos sobre una misma etapa de compilación:
#   migrate → solo para `prisma migrate deploy` (necesita el CLI, que es dependencia de desarrollo)
#   runtime → lo que corre de verdad: sin CLI, sin compilador, sin código fuente, sistema de archivos en solo lectura
# S-4: la base va fijada por digest (no por etiqueta): la misma imagen hoy y en un año. Se actualiza a propósito, no sola.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
RUN apk add --no-cache tini
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false PRISMA_HIDE_UPDATE_MESSAGE=1
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
# El cliente de Prisma se genera dentro de src/generated y `nest build` lo compila a dist/.
RUN npx prisma generate && npm run build

FROM build AS migrate
ENV NODE_ENV=production
USER node
ENTRYPOINT ["tini", "--"]
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
# Solo dependencias de producción, instaladas EXACTAMENTE como dice el lock.
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Carpetas de los volúmenes (misma forma que en desarrollo: dueño node; resultados con bit sticky 1777 para el worker).
RUN mkdir -p /data/uploads /data/results && chown node:node /data/uploads /data/results && chmod 1777 /data/results
USER node
EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]
