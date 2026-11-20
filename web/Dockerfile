# Imagen de PRODUCCIÓN del frontend (docker-compose.prod.yml). Next en modo «standalone»: la salida lleva solo
# lo que el servidor usa (sin node_modules completo ni código fuente). Base fijada por digest (S-4).
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
# v1.0 · La demo ofrece los datos de ejemplo para descargar: sin ellos, mejor no construir que publicar enlaces rotos.
RUN test -s public/ejemplos/cafe-ventas.csv || { echo 'Faltan los datos de ejemplo: corre scripts/preparar-ejemplos.sh'; exit 1; }
RUN npm run build

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
