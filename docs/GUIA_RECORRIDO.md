# Guía de recorrido de Atalaya

> Una sola guía, en orden. Cada fase agrega su capítulo al final. Léela con el código abierto al lado: cada paso nombra el archivo exacto.
>
> **Capítulo actual: v0.1, el esqueleto.** Todavía no hay usuarios ni análisis; hay algo más importante: las cuatro piezas hablando entre sí, y la seguridad de base que todo lo demás va a heredar.

---

## Capítulo v0.1: el esqueleto

### 1. Levantar el sistema

```bash
cp .env.example .env            # cambia las contraseñas: openssl rand -hex 24
docker compose up -d --build
docker compose ps               # 6 servicios: caddy, web, api, worker, db, redis
./scripts/smoke.sh              # 21 comprobaciones: funciona y es seguro
```

### 2. El mapa

```
                 red "edge" (con internet)                     red "data" (internal: SIN internet)
┌──────────┐    ┌───────┐   /api/*   ┌─────────────┐  SQL      ┌────────────┐
│Navegador │──► │ Caddy │──────────► │ api (Nest)  │─────────► │ db (PG 18) │
└──────────┘    │ :3070 │            │             │  RESP     ├────────────┤
   solo         │       │  resto     │             │─────────► │   redis    │
 127.0.0.1      │       │──────────► │ web (Next)  │           └─────▲──────┘
                └───────┘            └──────┬──────┘                 │ latido cada 10 s
                                            │ http://api:3000        │
                                            └─► (llama a la API)  ┌──┴───────────┐
                                                                  │worker(Python)│
                                                                  └──────────────┘
```

Tres ideas que se repiten en todas las fases:

1. **Una sola puerta.** Solo Caddy publica un puerto, y solo en `127.0.0.1`. La base y Redis no tienen puerto: desde fuera de Docker no existen.
2. **Dos redes.** `data` es `internal: true`, es decir, sin salida a internet. El worker vive solo ahí: cuando procese archivos de desconocidos (v0.7), aunque alguien lograra ejecutar código dentro, no podría sacar nada.
3. **Cerrado por defecto.** En la API, toda ruta nueva nace cerrada (401). Para abrirla hay que marcarla con `@Public()`, así que olvidar una protección es imposible: lo único que se puede olvidar es abrirla.

### 3. Recorrido 1: el navegador pide la página principal

```bash
curl -i http://localhost:3070/
```

| Paso | Dónde | Qué pasa |
|---|---|---|
| 1 | `Caddyfile` | La ruta no empieza con `/api`, así que Caddy la manda a `web:3000`. |
| 2 | `web/src/app/page.tsx` | Es un **Server Component**: corre en el servidor de Next, no en el navegador. `dynamic = 'force-dynamic'` hace que se arme en cada visita. |
| 3 | `web/src/lib/api.ts` | `getHealth()` llama a `http://api:3000/api/health` **por la red interna** (no vuelve a pasar por Caddy). Lleva tiempo límite de 3 s. Sus tipos salen del contrato, no se escriben a mano. |
| 4 | API | Ver recorrido 2. |
| 5 | `page.tsx` | Con el JSON arma una tabla HTML y Next la envía. |
| 6 | `Caddyfile` | De salida, Caddy agrega las cabeceras de seguridad y borra `Server` y `X-Powered-By`. |

`import 'server-only'` en `api.ts` hace que el build **falle** si alguien importa ese archivo desde un componente de navegador. Así la URL interna y, en v0.2, las cookies nunca llegan al cliente.

### 4. Recorrido 2: una petición a la API

```bash
curl -s http://localhost:3070/api/health
# {"status":"ok","checks":{"database":"ok","redis":"ok","worker":"ok"}}
```

| Paso | Dónde | Qué pasa |
|---|---|---|
| 1 | `Caddyfile` | `/api/*` va a `api:3000`. |
| 2 | `api/src/main.ts` | `trust proxy` hace que `req.ip` sea la IP real del visitante y no la de Caddy. `setGlobalPrefix('api')` explica por qué el controlador dice `health` y la URL es `/api/health`. |
| 3 | `api/src/app.module.ts` | Guarda 1, `ThrottlerGuard`: ¿esta IP pasó de 60 peticiones por minuto? Entonces 429. |
| 4 | `api/src/common/auth/deny-by-default.guard.ts` | Guarda 2: ¿la ruta tiene `@Public()`? Si no, 401. |
| 5 | `api/src/health/health.controller.ts` | Llama al servicio. Si algo está caído, responde **503**. |
| 6 | `api/src/health/health.service.ts` | Tres revisiones **en paralelo** (`Promise.all`), cada una con tiempo límite de 2 s: `SELECT 1` en Postgres (Prisma), `PING` a Redis y `EXISTS` de la llave del latido. |
| 7 | — | La respuesta lleva solo estados: nunca el texto de un error, porque podría revelar hosts o versiones (OWASP API8). |

**El orden de las guardas importa:** el tope va primero, así un atacante agota su cupo antes de poder probar credenciales.

### 5. Recorrido 3: el latido del worker

| Paso | Dónde | Qué pasa |
|---|---|---|
| 1 | `worker/atalaya_worker/__main__.py` | El bucle principal: cada 10 s llama a `beat()`. Atiende SIGTERM para salir limpio cuando Docker lo detiene. |
| 2 | `worker/atalaya_worker/heartbeat.py` | Escribe `atalaya:worker:heartbeat` con **vigencia de 30 s**. |
| 3 | Redis | Si el worker muere, la llave **caduca sola**: no hace falta que nadie avise. |
| 4 | `health.service.ts` | La API solo pregunta si la llave existe. |

La llave es un **contrato** entre dos lenguajes y está escrito en `contracts/README.md`. Las dos pruebas lo vigilan: `worker/tests/test_heartbeat.py` y `api/src/health/health.service.spec.ts`.

### 6. Experimentos (hazlos: así se aprende)

| # | Haz esto | Qué deberías ver | Qué enseña |
|---|---|---|---|
| 1 | `docker compose stop worker`, espera 35 s y vuelve a pedir `/api/health` | `503` y `"worker":"down"` | Detección de fallas sin que nadie avise (vigencia) |
| 2 | Quita `@Public()` de `health.controller.ts` y guarda | `401` | Cerrado por defecto |
| 3 | `for i in $(seq 65); do curl -s -o /dev/null -w '%{http_code} ' localhost:3070/api/health; done` | Los últimos son `429` | Tope de peticiones (OWASP API4) |
| 4 | `curl -I localhost:3070/` | Cabeceras `X-Frame-Options`, `nosniff`, CSP… y sin `Server` | Cabeceras de seguridad en un solo lugar |
| 5 | `docker compose exec worker python -c "import socket; socket.create_connection(('1.1.1.1',443),3)"` | Error de red | El aislamiento de la red `data` |
| 6 | Agrega un campo al `HealthReport` en `contracts/openapi.yaml` y corre `npm run contract:types` en `web/` | El tipo cambia; el CI fallaría si el archivo generado no se actualiza | Contrato primero |
| 7 | `docker compose exec db psql -U atalaya -c 'select version()'` | La versión de Postgres | Se entra a la base **desde dentro**: no tiene puerto |

### 7. Seguridad de esta fase y cómo se comprueba

| Promesa | Comprobación |
|---|---|
| Cero secretos en el repo | `.githooks/pre-commit` (gitleaks + bloqueo de `.env` + patrones privados) y el job `secrets` del CI, que revisa **toda** la historia |
| Solo `127.0.0.1` y una sola puerta | `scripts/smoke.sh` (sección Aislamiento) |
| Cabeceras en todas las respuestas | `scripts/smoke.sh` |
| Worker sin internet, sin root y de solo lectura | `scripts/smoke.sh` |
| Cerrado por defecto | `deny-by-default.guard.spec.ts` |
| Errores sin detalles internos | `health.service.spec.ts` |
| Dependencias sin vulnerabilidades conocidas | `npm audit` y `pip-audit` en el CI |
| Acciones del CI no secuestrables | Fijadas por SHA en `.github/workflows/ci.yml` |

### 8. Glosario de esta fase

- **Reverse proxy (Caddy):** el portero. Recibe todo y decide a quién pasarlo.
- **Red `internal`:** una red de Docker sin salida a internet.
- **Guarda (guard):** código de Nest que decide, antes del controlador, si la petición sigue.
- **Server Component:** componente de React que corre solo en el servidor.
- **Contrato (OpenAPI):** el documento que dice qué rutas existen y qué devuelven. Las piezas lo obedecen.
- **TTL (vigencia):** segundos que vive una llave en Redis antes de borrarse sola.
- **Fail-closed:** ante la duda, negar.
