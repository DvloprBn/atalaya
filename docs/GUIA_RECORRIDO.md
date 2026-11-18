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

---

## Capítulo v0.3: roles con jerarquía y administración de cuentas

> Lo nuevo: el panel `/admin`, invitaciones por correo y la regla que manda en todo: **solo se gestiona lo que está estrictamente por debajo de tu nivel**. Ataques y defensas en [`laboratorio/v0.3-roles.md`](laboratorio/v0.3-roles.md).

### 1. Preparar

```bash
docker compose exec api npx prisma migrate deploy   # aplica la migración "admin"
```

Entra como `admin@example.com` (o `super@example.com`) con `TestOnly123!` y ve a **Mi cuenta → Administración de cuentas**.

### 2. Los niveles

| Nivel | Rol | Gestiona a | Tope de cuentas activas |
|---|---|---|---|
| 5 | super | 0–4 | 1 |
| 4 | director | 0–3 | 1 |
| 3 | admin | 0–2 | — |
| 2 | manager | (sin panel todavía) | — |
| 1 | staff | (sin panel todavía) | — |
| 0 | usuario | — | — |

Dos capas, cada una con su trabajo:

1. **La puerta** (`common/auth/roles.guard.ts` + `@MinLevel`): ¿puedes entrar a esta **función**? Sin el nivel → 403.
2. **Los objetos** (`admin/hierarchy.ts`): dentro de la función, ¿qué **cuentas** puedes ver y tocar? Las de arriba → 404, como si no existieran.

### 3. Recorrido: invitar a una persona

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `web/src/app/admin/page.tsx` | El formulario solo ofrece los roles que da `GET /api/admin/roles` (los de nivel menor al tuyo). |
| 2 | `app.module.ts` | Guardas: tope → origen → sesión → **nivel** (`@MinLevel(3)`). |
| 3 | `admin/admin-users.service.ts` → `create` | ¿El rol está por debajo de ti? (403 si no). En una **transacción**: ¿hay cupo en ese rol? (candado sobre la fila del rol); ¿el correo ya existe? (409); crea la cuenta **sin contraseña** y la invitación. |
| 4 | `auth/invitations.service.ts` → `send` | El enlace (72 h) y el correo se guardan **en la misma transacción** que la cuenta: nacen juntos o ninguno. |
| 5 | `web/src/app/bienvenida/page.tsx` | La persona elige su contraseña. `accept` reclama el enlace (un solo uso) y activa la cuenta con el correo ya verificado. |

### 4. Recorrido: cambiar un rol

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `web/src/app/admin/user-row.tsx` | El selector manda `PATCH /api/admin/users/:id/role` y **vuelve a leer la tabla** pase lo que pase. |
| 2 | `ParseUUIDPipe` | Un id que no es UUID → 400 antes de tocar la base. |
| 3 | `admin-users.service.ts` → `lockTarget` | `SELECT … FOR UPDATE OF u`: bloquea la cuenta y lee su nivel **bajo candado**. Si está a tu nivel o arriba → 404. |
| 4 | `canAssign` | El nivel actual y el nuevo deben estar por debajo del tuyo → si no, 403. |
| 5 | `ensureCapacity` | Si el rol tiene tope (director, super), candado sobre la fila del rol y conteo de activas → 409 si está lleno. |

### 5. Recorrido: desactivar

`setDisabled` marca `disabled_at` y revoca **todas** las sesiones de la cuenta en la misma transacción. Como el guard revisa la sesión en cada petición (v0.2), la persona queda fuera **en su siguiente clic**. Reactivar no revive las sesiones viejas.

### 6. El inventario de rutas

`api/src/route-inventory.spec.ts` recorre los controladores del `AppModule`, saca método, ruta y si es `@Public()` de los decoradores, y lo compara con `contracts/openapi.yaml`. Es la versión automática de «toda ruta nueva se escribe primero en el contrato».

### 7. Experimentos

| # | Haz esto | Qué deberías ver | Qué enseña |
|---|---|---|---|
| 1 | Entra como `admin` y abre `/admin` | Solo cuentas usuario, staff y manager | La jerarquía en las consultas |
| 2 | Entra como `super`, copia el id del director y pídelo como `admin` con curl | `404` | IDOR: no se confirma que existe |
| 3 | Invita a alguien, abre Mailpit y acepta la invitación | La cuenta pasa de «invitada» a «activa» | Contraseña que solo la persona conoce |
| 4 | Entra con esa cuenta en otra ventana, desactívala desde el admin y recarga su `/cuenta` | Te saca al login | Desactivar corta al instante |
| 5 | Agrega una ruta `@Public()` de prueba en cualquier controlador y corre `npm test` en `api/` | Falla `route-inventory.spec.ts` | El contrato manda |
| 6 | En `hierarchy.ts` cambia `<` por `<=` y corre `npm test` | Fallan 10 pruebas | Una regla, una prueba que la vigila |

### 8. Glosario de esta fase

- **RBAC (control de acceso por roles):** los permisos dependen del rol; aquí además los roles tienen jerarquía.
- **IDOR:** acceder a un objeto ajeno cambiando su identificador.
- **Escalada vertical:** conseguir un nivel mayor al propio.
- **`FOR UPDATE`:** bloquea filas hasta que termina la transacción; quien llega después espera y ve el dato ya actualizado.
- **Invitación:** cuenta creada sin contraseña que se activa con un enlace de un solo uso.

---

## Capítulo v0.4: la interfaz «Observatorio»

> Lo nuevo: Atalaya deja de ser un esqueleto. Dirección elegida por el dueño entre tres propuestas (en un lienzo de diseño privado, fuera del repo). Ninguna regla de seguridad cambió: la interfaz solo **muestra**; quien protege sigue siendo la API.

### 1. La idea en una línea

Atalaya es una torre de vigía: **turquesa = lo normal**, **ámbar = lo que se sale de lo normal**. El radar de anomalías es la pieza central y, en la parte B, mostrará los días reales del negocio.

### 2. Dónde vive cada cosa

| Archivo | Qué hace |
|---|---|
| `web/src/app/globals.css` | **Todos** los tokens (colores, radios, fuentes) y los estilos base de formularios, botones, tablas y mensajes. Cambias un color aquí y cambia en todo el sitio. |
| `web/src/app/layout.tsx` | Carga las 3 fuentes con `next/font`: se descargan **al compilar** y se sirven desde el propio sitio. |
| `web/src/components/brand.tsx` | La marca (mini radar + nombre). |
| `web/src/components/radar.tsx` | El radar: anillos, ejes, barrido y puntos. Recibe los puntos como dato. |
| `web/src/components/auth-shell.tsx` | Marco de las pantallas públicas: contenido a la izquierda, radar a la derecha (se oculta en el teléfono). |
| `web/src/components/app-shell.tsx` | Marco con sesión: barra con navegación según tu nivel, tu correo y «Cerrar sesión». |
| `web/src/components/new-password-screen.tsx` | La pantalla de «elige una contraseña» que comparten `/restablecer` y `/bienvenida`. |
| `*.module.css` | Estilos de UN componente. Next les cambia el nombre de clase para que no choquen con nada más. |

### 3. Decisiones que enseñan algo

- **Sin librerías de estilos:** CSS normal con variables. Menos cosas que aprender a la vez, y se ve exactamente qué regla pinta qué.
- **Fuentes servidas por el propio sitio:** si el navegador las pidiera a Google, cada visita le avisaría a un tercero, y la CSP tendría que abrirse a otro dominio.
- **Contraste medido** (comentario al inicio de `globals.css`): todo texto queda en 4.5:1 o más contra el fondo (WCAG AA).
- **Movimiento:** el barrido del radar solo anima `transform` (barato) y se detiene con `prefers-reduced-motion`.
- **Foco visible** en todo control (`:focus-visible`): quien navega con teclado sabe dónde está.
- **Ocultar un enlace no protege nada:** la barra no muestra «Administración» a quien no tiene nivel, pero la que niega es la API (`@MinLevel`).

### 4. Pruebas de esta fase (`web/test/interface.spec.ts`)

| Promesa | Cómo se comprueba |
|---|---|
| Ninguna pantalla pide nada a terceros | Escucha cada petición del navegador en 4 pantallas: todas deben ir al propio sitio. **Falla plantada:** un `<link>` a Google Fonts la hizo caer. |
| Sin desbordes en el teléfono | A 390 px, el ancho del documento no pasa del de la ventana. |
| Movimiento reducido | Con `reducedMotion: 'reduce'`, la animación del barrido es `none`. |

Las pruebas de v0.2 y v0.3 siguen pasando sin cambiar su lógica: buscan por **rol y nombre accesible** (`getByRole`, `getByLabel`), no por clases CSS, así que sobreviven a un rediseño completo.

### 5. Experimentos

| # | Haz esto | Qué deberías ver |
|---|---|---|
| 1 | En `globals.css` cambia `--signal` por `#a78bfa` | Todo lo «normal» (botones, radar, enlaces) cambia de color a la vez |
| 2 | En tu sistema activa «reducir movimiento» y recarga `/login` | El radar se queda quieto |
| 3 | Abre las herramientas del navegador → Red, recarga | Todas las peticiones van a `localhost:3070` |
| 4 | Haz la ventana angosta (menos de 860 px) | El radar se oculta y queda una sola columna |

---

## Capítulo v0.5: el segundo factor (2FA con TOTP)

> Lo nuevo: una contraseña robada ya no basta. Ataques y defensas, ficha por ficha, en [`laboratorio/v0.5-2fa.md`](laboratorio/v0.5-2fa.md).

### 1. Preparar

```bash
# La llave que cifra los secretos del 2FA (64 hexadecimales). Va en tu .env, NUNCA en el repo:
echo "TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # tablas two_factors y recovery_codes
```

Para probarlo necesitas una app de autenticación en el teléfono (Google Authenticator, Authy, 1Password…) o la prueba de Chrome (`npm run test:browser`), que calcula los códigos sola.

### 2. Qué es TOTP, en cuatro líneas

```
secreto (20 bytes al azar, lo comparten el servidor y tu teléfono)
paso    = segundos desde 1970 ÷ 30
código  = HMAC-SHA1(secreto, paso) → 4 bytes → módulo 1.000.000 → 6 dígitos
```

Tu teléfono y el servidor calculan lo mismo por separado y comparan. **No se manda nada por la red** salvo el código. El archivo `api/src/auth/two-factor/totp.ts` tiene todo en ~60 líneas, y `totp.spec.ts` lo valida con los **vectores de prueba oficiales del RFC 6238**. Además se comprobó contra `pyotp` (la librería que usará el gemelo en Django): mismo secreto, mismo código.

### 3. Las tablas

| Tabla | Para qué |
|---|---|
| `two_factors` | Una fila por cuenta: el secreto **cifrado**, cuándo se confirmó y el último paso aceptado (anti-repetición). Sin `confirmed_at` está «pendiente» y no protege nada. |
| `recovery_codes` | Los 10 códigos de recuperación, solo su hash, con `used_at` cuando se gastan. |

### 4. Recorrido: activar el 2FA

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `web/src/app/cuenta/seguridad/enable-flow.tsx` | Pide la contraseña y llama a `POST /api/auth/2fa/setup`. |
| 2 | `auth/two-factor/two-factor.service.ts` → `setup` | Vuelve a verificar la contraseña (`reauth`); crea un secreto al azar, lo **cifra** (`secret-box.ts`) y lo guarda como pendiente. Devuelve el secreto, la dirección `otpauth://…` y el QR como SVG. |
| 3 | `enable-flow.tsx` | Muestra el QR dentro de un `<img>` (donde un SVG no puede ejecutar scripts) y la clave para escribirla a mano. |
| 4 | `two-factor.service.ts` → `enable` | Con un código de la app, confirma el secreto **y en una transacción**: marca el 2FA activo, guarda el paso usado, crea los 10 códigos de recuperación y **cierra las demás sesiones**. |
| 5 | `recovery-codes.tsx` | Los códigos se muestran **una sola vez**: copiar, descargar y «Ya los guardé». |

### 5. Recorrido: entrar con 2FA

```bash
curl -s -X POST localhost:3070/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"…","password":"…"}'
# {"twoFactorRequired":true,"challenge":"…43 caracteres…"}   ← y NINGUNA cookie
```

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `auth/auth.service.ts` | Con la contraseña buena y el 2FA activo, en vez de abrir sesión pide a `Challenges` un **reto** de un solo uso. |
| 2 | `two-factor/challenges.ts` | Guarda en Redis el id del usuario bajo el **hash** del reto, con 5 minutos de vida y un contador de intentos. |
| 3 | `web/src/app/login/page.tsx` | Pasa al segundo paso y manda `POST /api/auth/2fa/verify` con el reto y el código. |
| 4 | `two-factor/second-factor.service.ts` → `verifyLogin` | ¿El reto existe? ¿La cuenta no está bloqueada? ¿El código es bueno (`checkCode`)? Si no, suma un fallo a la cuenta **y** al reto. Si sí, **gasta el reto** (`GETDEL`: solo una petición lo gana), limpia los fallos y abre la sesión. |
| 5 | `checkCode` | Un código de 6 dígitos va por TOTP (`UPDATE … WHERE last_used_step < paso`); si no, se toma como código de recuperación y se gasta por su hash. |

### 6. El «token puente», explicado

Entre la contraseña y el código hay un estado intermedio: «esta persona ya puso la contraseña buena, falta el código». El **reto** representa exactamente eso, y por eso se cuida tanto: no es una sesión, nace y muere en `/auth/2fa/verify`, vive 5 minutos, se gasta una sola vez, aguanta 5 intentos y en Redis solo existe su hash.

### 7. Los cuatro «gastos atómicos»

Casi todas las defensas de esta fase son la misma idea: **una operación condicionada que solo una petición puede ganar**, en vez de «leer, decidir, escribir» (que dos peticiones simultáneas ganarían a la vez).

| Qué se gasta | Cómo |
|---|---|
| El reto | `GETDEL` en Redis |
| Un código de recuperación | `UPDATE recovery_codes … WHERE code_hash = … AND used_at IS NULL` |
| Un paso de TOTP | `UPDATE two_factors … WHERE last_used_step < paso` |
| El 2FA pendiente al confirmarse | `UPDATE two_factors … WHERE confirmed_at IS NULL` |

### 8. Experimentos

| # | Haz esto | Qué deberías ver | Qué enseña |
|---|---|---|---|
| 1 | Activa el 2FA en <http://localhost:3070/cuenta/seguridad> con tu teléfono | Los códigos de la app coinciden con los que valida el servidor | TOTP es interoperable |
| 2 | `docker compose exec db psql -U atalaya -c "select left(secret_enc,60) from two_factors"` | Texto como `v1.…` | El secreto no está en claro |
| 3 | Entra, escribe 5 códigos malos y luego el bueno | Código incorrecto o vencido | El reto se destruye a los 5 intentos |
| 4 | Entra con el código de la app y, sin esperar 30 s, repite el mismo código en otra entrada | Rechazado | Anti-repetición |
| 5 | En `second-factor.service.ts` quita la condición `lastUsedStep: { lt: step }` y corre `npm run test:e2e` | Fallan 3 pruebas | Una prueba vale si sabe fallar |
| 6 | En `challenges.ts` pon `MAX_TRIES = 5000` y corre `npm run test:e2e` | Falla la prueba de los 5 intentos | Cada tope tiene su prueba |
| 7 | Quita el `key="paso-2"` del formulario en `login/page.tsx` y corre `npm run test:browser` | El campo del código aparece con el correo escrito | Un error real de React que las otras pruebas no veían |

### 9. Glosario de esta fase

- **TOTP:** contraseña de un solo uso basada en el tiempo (RFC 6238): el código cambia cada 30 segundos.
- **HOTP:** la versión por contador (RFC 4226) sobre la que se construye TOTP.
- **Paso (step):** el número del intervalo de 30 s en el que estás.
- **AES-256-GCM:** cifrado que además **firma**: si alguien altera el texto, descifrar falla.
- **AAD (datos asociados):** datos que no se cifran pero **sí se firman**; aquí, el id del usuario, para que un secreto no se pueda mover a otra cuenta.
- **Anti-repetición (replay):** rechazar un código que ya se usó aunque siga dentro de su ventana.
- **Reto (challenge):** el token de un solo uso entre la contraseña y el código.
- **`GETDEL`:** leer y borrar una llave de Redis en un solo paso atómico.

---

## Capítulo v0.6: entrar con Google

> Lo nuevo: «Continuar con Google» (OpenID Connect: Authorization Code + PKCE + `state` + `nonce`), la política de vinculación de cuentas y un servidor OAuth **falso** para probar todo sin cuenta de Google. Ataques y defensas, ficha por ficha, en [`laboratorio/v0.6-google.md`](laboratorio/v0.6-google.md).

### 1. Preparar y probar

```bash
docker compose up -d --build                         # ahora levanta también mock-idp (el "Google" de prueba)
docker compose exec api npx prisma migrate deploy    # tabla oauth_identities
```

Abre <http://localhost:3070/login> (**con `localhost`, no `127.0.0.1`**: la cookie que ata el intento al navegador es de un solo host) y pulsa **«Continuar con Google»**. Verás la pantalla del servidor de prueba (<http://localhost:3072>, solo esta máquina): elige una cuenta y vuelves a Atalaya con la sesión abierta.

### 2. Qué es OpenID Connect, en pocas líneas

OAuth 2.0 resuelve «dejar que una aplicación haga cosas en tu nombre». **OpenID Connect** le agrega lo que necesitamos para un login: además del código, Google devuelve un **`id_token`**, un JWT firmado que dice **quién eres** (`sub`, `email`, `email_verified`) y **para quién se emitió** (`aud`). Atalaya no pide permisos para tocar nada de tu cuenta de Google: solo `openid email`.

### 3. El recorrido, paso a paso

| Paso | Archivo | Qué pasa |
|---|---|---|
| 1 | `web/src/components/google-button.tsx` | Pregunta a `/api/auth/providers` si Google está configurado y muestra un **enlace** (no una llamada de JavaScript: el navegador debe navegar). |
| 2 | `auth/oauth/oauth.controller.ts` → `start` | Pide a `OAuthService.start()` la URL y pone la cookie `__Host-atalaya_oauth`. Responde 302 a Google. |
| 3 | `auth/oauth/oauth.service.ts` → `start` | Arma la URL: `response_type=code`, `client_id`, `redirect_uri` exacto, `scope=openid email`, `state`, `nonce` y `code_challenge` (PKCE). |
| 4 | `auth/oauth/state-store.ts` → `create` | Guarda en Redis (10 min) el `nonce`, el `verifier` y el hash de la cookie, bajo el **hash** del `state`. |
| 5 | Google | La persona elige su cuenta; Google devuelve el navegador a `/api/auth/google/callback?code=…&state=…`. |
| 6 | `oauth.controller.ts` → `callback` | Lee la cookie y la **borra** (el intento se gasta pase lo que pase). Cualquier fallo → `/login?error=google`. |
| 7 | `state-store.ts` → `consume` | `GETDEL` del intento y comparación de la cookie en tiempo constante. Aquí muere el login CSRF. |
| 8 | `oauth.service.ts` → `exchange` + `http-json.ts` | El **servidor** llama al endpoint de Google con el `code` y el `verifier` (PKCE). Tiempo límite, sin redirecciones, 64 KB máximo. |
| 9 | `auth/oauth/id-token.ts` | Comprueba algoritmo, llave (`kid`), firma, emisor, audiencia, vigencia, `nonce` y `email_verified`. |
| 10 | `auth/oauth/google-accounts.ts` | Decide a qué cuenta corresponde (ver §4). |
| 11 | `oauth.service.ts` | Con 2FA activo → un **reto**; si no, abre sesión. |
| 12 | `oauth.controller.ts` | 302 a `/cuenta` con las cookies de sesión, o a `/login#challenge=…` si falta el segundo factor. |

### 4. A qué cuenta corresponde una cuenta de Google (`google-accounts.ts`)

```
¿Esa identidad (el "sub" de Google) ya está enlazada?  ──sí──►  entra a SU cuenta (aunque el correo haya cambiado)
        │ no
¿Ese correo ya tiene cuenta?
   ├─ sí, verificada y sin otra cuenta de Google ──►  se VINCULA y se AVISA por correo al dueño
   ├─ sí, pero desactivada / con otra cuenta de Google ──►  se rechaza
   └─ no ──►  se CREA una cuenta nueva: rol usuario, sin contraseña, correo verificado
```

Dos intentos simultáneos con la misma cuenta nueva: uno crea y el otro choca con la restricción única; vuelve a mirar y encuentra lo que acaba de crear el primero.

### 5. El servidor OAuth falso (`mock-idp/`)

Es un archivo (`server.mjs`, sin dependencias) que hace el papel de Google: pantalla de «elegir cuenta», canje de código, `id_token` firmado con RSA y sus llaves públicas (JWKS). Por eso el CI y tu máquina prueban el flujo completo sin cuenta de Google.

Y puede **mentir a propósito**: con `x_fault=nonce`, `aud`, `iss`, `expired`, `future-iat`, `alg-none`, `hs256`, `bad-signature` o `unknown-kid`, firma un `id_token` defectuoso, y las pruebas comprueban que Atalaya los rechaza todos. **Nunca va a producción**: el compose de producción (v1.0) no lo incluye.

### 6. Usar Google de verdad (opcional)

1. En <https://console.cloud.google.com> crea un **cliente OAuth** de tipo «Aplicación web» y agrega como URI de redirección `http://localhost:3070/api/auth/google/callback`.
2. Descomenta los seis `OAUTH_*` de `.env.example` en tu `.env` con tus valores y reinicia la API.

No hay que cambiar código: el compose usa lo que pongas en `.env` y, si no pones nada, el servidor falso.

### 7. Experimentos

| # | Haz esto | Qué deberías ver | Qué enseña |
|---|---|---|---|
| 1 | Entra con Google y mira **Herramientas del navegador → Aplicación → Cookies** | `__Host-atalaya_oauth` aparece en el viaje y desaparece al volver | La cookie del intento se gasta |
| 2 | En la pantalla de «elegir cuenta» agrégale `&x_fault=nonce` a la URL y elige una cuenta | Vuelves a `/login` con «No pudimos iniciar sesión con Google» | Un token de otro intento no sirve |
| 3 | Mismo experimento con `&x_fault=hs256` y con `&x_fault=aud` | El mismo aviso | Cada falsificación se rechaza |
| 4 | `docker compose logs api \| grep "con Google rechazado"` | `…rechazado: token_nonce`, `token_audience`… | El motivo va solo al log, nunca a la persona |
| 5 | Empieza un login, **copia el enlace del regreso**, ábrelo en una **ventana de incógnito** | Vuelves a `/login` con el aviso, sin sesión | Login CSRF: esa ventana no tiene la cookie |
| 6 | Entra con `ana.google@example.com`, ciérrala y vuelve a entrar | La misma cuenta (compara el `id` en `/api/auth/me`) | La identidad es el `sub`, no una cuenta nueva |
| 7 | En `google-accounts.ts` quita `\|\| existing.oauthIdentities.length > 0` y corre `npm test` | Falla 1 prueba unitaria; la suite viva sigue en verde | Defensa en capas: la base también lo impide |
| 8 | En `id-token.ts` quita la revisión de `header.alg` y corre `npm test` | Fallan 3 pruebas unitarias | Las unitarias aíslan cada capa |

### 8. Glosario de esta fase

- **OpenID Connect (OIDC):** la capa de identidad sobre OAuth 2.0. Devuelve un `id_token`.
- **Authorization Code:** el flujo en que el navegador recibe un código **de un solo uso** y el servidor lo canjea por los tokens.
- **PKCE:** prueba de que quien canjea el código es quien empezó el flujo (`verifier` secreto, `challenge` público).
- **`state`:** un valor al azar que viaja a Google y vuelve idéntico; ata el regreso a un intento nuestro.
- **`nonce`:** un valor al azar que vuelve **dentro del `id_token` firmado**; ata el token a ese intento.
- **JWKS:** el conjunto de llaves públicas de Google con las que se verifica la firma.
- **`sub`:** el identificador estable de la persona en Google. El correo puede cambiar; el `sub`, no.
- **Login CSRF:** hacer que la víctima termine el login de otra persona.
- **Defensa en capas:** que dos barreras distintas rechacen el mismo ataque.

## Capítulo v0.7: la bitácora de seguridad

> Lo nuevo: dos tablas (`security_events` y `audit_logs`), el aviso por correo cuando te roban una sesión, el recolector de reportes CSP y el panel **Seguridad del sistema** para el admin. Ataques y defensas en [`laboratorio/v0.7-bitacora.md`](laboratorio/v0.7-bitacora.md).

### 1. Preparar y probar

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate deploy     # tablas security_events y audit_logs
```

Entra como `admin@example.com` (`TestOnly123!`) y abre **Seguridad del sistema**. Para ver algo: falla un login a propósito, o mira la auditoría tras invitar a alguien.

### 2. Dos registros, dos preguntas

| | `security_events` | `audit_logs` |
|---|---|---|
| Responde | ¿Qué **intentaron** contra el sistema? | ¿Quién **hizo** qué (legítimamente)? |
| Quién escribe | El propio sistema, ante hechos hostiles o raros | Una persona con sesión, al actuar |
| Ejemplos | login fallido, cuenta bloqueada, refresh reusado, tope superado, CSP | rol cambiado, cuenta desactivada, 2FA activado |
| Se escribe | Aparte; **si falla, se ignora** (nunca rompe la petición) | **Dentro de la transacción** de la acción; si falla, la acción tampoco ocurre |

La diferencia del último renglón es la lección: una bitácora de ataques es *mejor esfuerzo* (que caiga no debe dejar a nadie sin entrar); una auditoría es *evidencia* (sin ella, la acción no cuenta).

### 3. Qué NO se guarda, a propósito

Ni contraseñas, ni correos de cuentas inexistentes, ni tokens, ni URLs completas. Del origen, solo un **HMAC** de la IP (con llave del servidor: una IP son 32 bits y un hash simple se invierte probándolas todas). El `detail` es un código corto como `bad_password` o `img-src host.example`. Si un dato no hace falta para entender el hecho, no se guarda: lo que no existe no se filtra.

### 4. Recorrido

| Archivo | Qué hace |
|---|---|
| `api/src/security/security-log.service.ts` | `record()` (tolerante a fallos, con dedupe) y la poda de 90 días |
| `api/src/security/ip-hash.ts` | HMAC de la IP y recorte de texto |
| `api/src/security/audit.ts` | `writeAudit(tx, …)`: la auditoría dentro de la transacción |
| `api/src/security/logging-throttler.guard.ts` | El tope de siempre, más un renglón `rate_limited` con la **ruta registrada** |
| `api/src/security/csp-report.ts` + `csp.controller.ts` | El recolector: dos formatos de reporte, solo directiva y host, siempre 204 |
| `api/src/security/security-read.service.ts` | Lo que lee el panel, con la jerarquía aplicada (OWASP API1) |
| `api/src/auth/sessions.service.ts` | Ante un robo: cierra, registra y **avisa por correo** |
| `web/src/app/admin/seguridad/*` | Radar de 14 días + tabla equivalente, bitácora con filtro, auditoría |

### 5. El radar

Cada punto es un día, de los últimos 14. Más lejos del centro = más eventos. **Ámbar = día de ataque**: 10 o más eventos, o cualquier sesión robada (eso nunca es ruido). La tabla de al lado dice lo mismo con palabras: el radar solo no lo lee un lector de pantalla. Los reportes CSP **cuentan** como eventos: una página rota por una política mal puesta también hace «ruido».

### 6. Lo que sigue pendiente (y por qué)

- El **tope de peticiones** sigue en la memoria del proceso (S-6). Con una instancia basta; con varias habría que pasarlo a Redis. Se decide en v1.0, cuando se sabe cuántas instancias habrá.
- La CSP sigue en **solo reporte**: ahora hay quien lea los reportes (S-2). Se pasa a bloqueo en v1.0, después de observar un tiempo.
