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

---

## Capítulo v0.2: registro, verificación, login y sesiones

> Lo nuevo: cuentas reales, correo de verificación, sesiones que se renuevan solas y cierre de sesión que corta al instante. Los ataques y sus defensas, ficha por ficha, están en [`laboratorio/v0.2-acceso.md`](laboratorio/v0.2-acceso.md).

### 1. Levantar y preparar

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # crea las tablas (la primera vez)
docker compose exec api npx prisma db seed          # 6 cuentas de prueba: <rol>@example.com / TestOnly123!
```

Los correos no salen a internet: los atrapa **Mailpit**, en <http://localhost:3071>.

### 2. Las tablas (`api/prisma/schema.prisma` y su migración)

| Tabla | Para qué |
|---|---|
| `roles` | Los 6 niveles (0 = usuario … 5 = super). Filas **fijas**, sembradas por la migración. |
| `users` | Una persona, una cuenta. Solo existe con el correo ya verificado. |
| `sessions` | Un inicio de sesión en un dispositivo. Se revisa en **cada** petición. |
| `refresh_tokens` | La cadena de refresh de una sesión. Cada uno sirve **una** vez. |
| `email_tokens` | Enlaces de correo de un solo uso (registro o restablecer), con su propósito. |
| `mail_outbox` | Bandeja de salida: los correos esperan aquí y un despachador los manda. |

La migración (`prisma/migrations/…_auth/migration.sql`) termina con **SQL escrito a mano**: los roles fijos y los `CHECK` que hacen que la base rechace datos imposibles aunque el código fallara. Uno de ellos enseña una trampa de verdad: `NULL IN (...)` da NULL, **y un CHECK que da NULL pasa**. Por eso el `IS NOT NULL` explícito.

### 3. Los dos tokens

| | Acceso | Refresh |
|---|---|---|
| Qué es | JWT firmado (HS256) | 43 caracteres al azar (opaco) |
| Dura | 10 minutos | Hasta que se use (una vez); la sesión, 7 días |
| Viaja | En cada petición a `/api` | Solo a `/api/auth` |
| Cookie | `__Host-atalaya_access` | `__Secure-atalaya_refresh` |
| En la base | Nada (solo su sesión) | Su SHA-256 |

¿Por qué dos? El de acceso viaja mucho, así que dura poco. El de refresh casi no viaja, y gracias a él la persona no escribe su contraseña cada 10 minutos.

### 4. Recorrido: registrarse

```bash
curl -s -X POST localhost:3070/api/auth/register -H 'content-type: application/json' \
  -d '{"email":"yo@example.com","password":"una frase larga de prueba"}'
```

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `main.ts` | El byte nulo se rechaza; el DTO valida y **normaliza** el correo (minúsculas, sin espacios). |
| 2 | `app.module.ts` | Guardas: tope (5 cada 15 min por IP) → origen (CSRF) → sesión (la ruta es `@Public()`). |
| 3 | `auth/auth.controller.ts` | Llama al servicio y responde **siempre** el mismo 202. |
| 4 | `auth/registration.service.ts` | Calcula Argon2 **siempre**. Si la cuenta existe, encola «ya tienes cuenta»; si no, guarda un `email_tokens` (con el hash de la contraseña) y encola «confirma tu correo». |
| 5 | `mail/mail.service.ts` | `enqueue` solo escribe en `mail_outbox`. Cada 5 s el despachador reclama un lote (`FOR UPDATE SKIP LOCKED`), lo manda por SMTP y vacía el cuerpo. |
| 6 | Mailpit | El correo llega con `http://localhost:3070/verificar?token=…`. |

### 5. Recorrido: confirmar el correo

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `web/src/app/verificar/page.tsx` | Lee el token **una vez** (`use-url-token.ts`), lo borra de la URL y hace `POST /api/auth/verify-email`. |
| 2 | `registration.service.ts` → `verify` | En una transacción: **reclama** el enlace con un `updateMany … where usedAt: null`. Si dos clics llegan a la vez, solo uno gana. Crea el usuario (rol `usuario`, verificado) e invalida los demás enlaces de ese correo. |

### 6. Recorrido: entrar y moverse con sesión

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `auth/auth.service.ts` | ¿Cuenta bloqueada por intentos? (Redis, **antes** de la base). Busca la cuenta y verifica la contraseña (contra un hash de relleno si no existe). |
| 2 | `auth/sessions.service.ts` → `start` | Crea la sesión y su primer refresh; firma el acceso con `sub` (usuario) y `sid` (sesión). |
| 3 | `auth/cookies.ts` | Pone las dos cookies: httpOnly, Secure, SameSite=Strict. |
| 4 | `auth/auth.guard.ts` | En **cada** petición protegida: verifica la firma y busca en la base que la sesión siga abierta y la cuenta activa. Deja al usuario en `req.user`. |
| 5 | `GET /api/auth/me` | Devuelve `{ id, email, role }`. Nunca el hash. |

### 7. Recorrido: el acceso vence (minuto 10)

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `web/src/lib/browser-api.ts` | Una llamada recibe 401. El cliente pide **una** renovación (compartida si hay varias llamadas a la vez) y repite la llamada. |
| 2 | `sessions.service.ts` → `rotate` | Busca el refresh por su hash. Si ya se había usado: ¿carrera o robo? (ver `handleReuse`). Si no, lo marca usado de forma **atómica** y emite un par nuevo. |

### 8. Recorrido: salir y restablecer

- **Logout** (`POST /api/auth/logout`): revoca la sesión. La cookie copiada deja de servir **al instante**, porque el guard revisa la sesión.
- **Restablecer** (`/olvide` → correo → `/restablecer`): misma respuesta exista o no la cuenta. Al usar el enlace se cambia la contraseña y se revocan **todas** las sesiones, en una sola transacción.

### 9. Experimentos

| # | Haz esto | Qué deberías ver | Qué enseña |
|---|---|---|---|
| 1 | Regístrate en <http://localhost:3070/registro> y abre Mailpit | El correo con el enlace | La bandeja de salida y el despachador |
| 2 | `docker compose exec db psql -U atalaya -c 'select email, used_at from email_tokens'` antes y después de abrir el enlace | `used_at` se llena | Un solo uso |
| 3 | `docker compose exec db psql -U atalaya -c 'select length(text) from mail_outbox'` | `0` en los enviados | El cuerpo con el token no se guarda |
| 4 | Entra, copia tus cookies desde las herramientas del navegador, cierra sesión y repite `curl -b 'cookie…' localhost:3070/api/auth/me` | `401` | El guard revisa la sesión |
| 5 | En las herramientas del navegador, borra solo `__Host-atalaya_access` y recarga `/cuenta` | Sigues dentro | La renovación automática |
| 6 | En `auth.guard.ts` quita la línea `revokedAt: null`, reinicia la API (`docker compose restart api`) y corre `npm run test:e2e` | 3 pruebas fallan | Una prueba vale si sabe fallar |

### 10. Pruebas de esta fase

```bash
cd api && npm test              # unitarias (sin Docker)
cd api && npm run test:e2e      # ataques contra el sistema vivo
cd web && npm run test:browser  # el recorrido completo en Chrome real
./scripts/smoke.sh              # 23 comprobaciones del sistema
```

Las rutas de acceso tienen topes por IP: la suite e2e cabe **una vez cada 15 minutos**. Para repetirla antes: `docker compose restart api` (los topes viven en la memoria del proceso).

### 11. Glosario de esta fase

- **JWT:** un texto firmado que dice «soy el usuario X, sesión Y, hasta tal hora». Cualquiera lo lee; solo la API lo puede firmar.
- **Token opaco:** texto al azar sin datos dentro; solo sirve para buscarlo en la base.
- **Rotación:** cambiar el refresh en cada uso; el viejo queda marcado como usado.
- **Enumeración:** averiguar qué cuentas existen por diferencias en las respuestas.
- **CSRF:** que otro sitio use tus cookies sin que lo sepas.
- **Bandeja de salida (outbox):** tabla donde los correos esperan a que un proceso aparte los mande.
- **Argon2id:** la función que convierte una contraseña en un hash costoso de adivinar.
