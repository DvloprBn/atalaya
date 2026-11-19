# Guía de recorrido de Atalaya

> Una sola guía, en orden. Cada fase agrega su capítulo al final. Léela con el código abierto al lado: cada paso nombra el archivo exacto.
>
> **Capítulo actual: v0.10, el informe de ventas y gastos.** Los capítulos van en orden, del v0.1 (el esqueleto) al final de esta guía; cada uno nombra los archivos exactos que explica.

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

---

## Capítulo v0.8: subir archivos sin confiar en nadie

> Lo nuevo: la subida de CSV y `.xlsx`, una cola en Redis, un **worker** que los revisa por dentro, y las pantallas **Mis archivos** y **Archivos de las cuentas**. Ataques y defensas en [`laboratorio/v0.8-subida.md`](laboratorio/v0.8-subida.md).

### 1. Preparar y probar

```bash
# Dos contraseñas nuevas en tu .env (el worker tiene su propio usuario de Redis y su propio rol de base):
printf 'WORKER_REDIS_PASSWORD=%s\nWORKER_DB_PASSWORD=%s\n' $(openssl rand -hex 24) $(openssl rand -hex 24) >> .env
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # tabla uploads y el rol atalaya_worker (sin poder entrar todavía)
docker compose up -d                                # el servicio db-roles le pone contraseña al rol y termina
./scripts/permisos-worker.sh                        # comprueba que el worker solo puede lo que debe
```

Entra como `usuario@example.com` (`TestOnly123!`) → **Mis archivos**. Sube un CSV: pasa de «en cola» a «aceptado» solo. Sube uno con solo el encabezado: queda «rechazado» con su motivo.

### 2. Un archivo es entrada hostil que otra pieza va a abrir

Toda la fase sale de una frase: **el archivo lo escribe un desconocido y lo va a abrir un programa que no controlamos.** De ahí tres decisiones:

| Decisión | Qué evita |
|---|---|
| **Dos revisiones**: la API mira lo barato (firma, tamaño, forma) *antes de guardar*; el worker mira por dentro, aislado | Que el programa que atiende a todos abra archivos peligrosos |
| **El tipo sale de los bytes**, no de la extensión ni del `Content-Type` (los dos los escribe quien sube) | Un `.xlsx` que es otra cosa; un `.csv` que es un ejecutable |
| **El worker puede caer**: por eso solo toca el *estado* de los archivos | Que un archivo que explote al lector llegue a las cuentas, la bitácora o los demás archivos |

### 3. El camino de un archivo

1. **Navegador** (`web/src/app/archivos/upload-form.tsx`): una revisión *de cortesía* (extensión, 0 bytes, 5 MB). Ahorra una subida inútil; **no protege nada**.
2. **API** (`api/src/uploads/`): `file-signature.ts` decide por bytes. Si pasa, guarda los bytes con un nombre **generado por el servidor** (`upload-storage.ts`), anota la fila (`uploads`, con el tope de 10 por cuenta bajo un candado) y encola **solo el id** en el Redis Stream `atalaya:uploads`. Responde **202**: la revisión profunda es asíncrona.
3. **Worker** (`worker/atalaya_worker/`): toma el mensaje (`jobs.py`), pasa el archivo a «checking» en **una sola sentencia** (`store.py`), lo lee con cuidado y lo revisa (`review.py` → `inspect_xlsx.py` / `inspect_csv.py`). Deja `accepted` o `rejected` con un motivo de **lista cerrada**.
4. **Pantalla**: se vuelve a leer sola, con pausas cada vez más largas, hasta que nada esté pendiente.

### 4. Qué mira cada una

| | API (antes de guardar) | Worker (ya encolado) |
|---|---|---|
| Tipo | Firma de bytes y extensión coherentes; sin `.xlsm` ni `vbaProject.bin` | Lo repite; además SHA-256 y tamaño contra lo guardado |
| Tamaño | 5 MB, cortado mientras llega | 50 MB descomprimido y razón 100:1, contando bytes **reales** |
| Forma | Un solo campo `file` | Entradas del zip, rutas, nombres repetidos; XML sin DTD (`defusedxml`); filas y columnas (50 000 × 200) |
| Cuenta | 10 archivos, con candado | — |

### 5. El radio de la explosión (S-1)

El worker se conecta con **credenciales propias**:

- **Postgres:** el rol `atalaya_worker` (migración `uploads_worker_role`) lee 7 columnas de `uploads` y actualiza 3. No ve cuentas, sesiones ni la bitácora. La migración lo crea **sin poder entrar** y sin contraseña (un secreto no vive en una migración); el servicio `db-roles` del compose le pone la contraseña de tu `.env`.
- **Redis:** el usuario `worker` solo puede crear su grupo, leer y confirmar su cola y escribir su latido.
- **Disco:** el volumen de archivos lo monta en **solo lectura**.

`scripts/permisos-worker.sh` lo comprueba con las credenciales reales: 13 cosas de Postgres y 8 de Redis que deben fallar, y 4 que deben funcionar. Si alguien le da un permiso de más, el script cae.

### 6. Un worker que muere a mitad

El mensaje de la cola solo se confirma al terminar. Si el worker muere, el mensaje queda **pendiente** y al volver se ve otra vez. Ahí está la trampa: si el archivo fue *justo* lo que lo mató, reabrirlo lo mata otra vez, en bucle. Por eso `claim` dice si el archivo **ya estaba** en «checking»; en ese caso no se revisa, se cierra como `worker_timeout`. *Un archivo que ya mató al worker una vez no se reabre.*

### 7. Lo que sigue pendiente (y por qué)

- La contraseña de Redis sigue en los argumentos de `redis-server` (S-1): el archivo ACL y los secretos de Docker llegan en v1.0.
- Un CSV en latin1 (típico de Excel en español) se rechaza. *(En v0.9 no se resolvió: sigue pendiente.)*
- S-15: una pantalla con sesión válida manda a `/login` ante un 429 de `/auth/me`.
- Los archivos huérfanos (la API cae entre guardar y anotar) los barre la poda de v1.0.
- El **análisis** de lo subido (lector de ventas, mapeo de columnas, informe de calidad) empieza en v0.9: hoy un archivo «aceptado» solo significa *«no es peligroso»*, no *«es útil»*.

---

## Capítulo v0.9: los datos de un desconocido, de vuelta a sus manos

> Lo nuevo: el **análisis de ventas** en dos pasos (vista previa y confirmar las columnas → limpieza e informe de calidad), un **worker** que lee CSV y `.xlsx` con `openpyxl`, dos descargas en CSV y las pantallas **Mis análisis**. Ataques y defensas en [`laboratorio/v0.9-analisis.md`](laboratorio/v0.9-analisis.md).

### 1. Preparar y probar

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # tabla analyses (y sus permisos para el worker)
docker compose up -d                                # el volumen de resultados y el stream nuevo en el ACL de Redis
./scripts/permisos-worker.sh                        # el worker solo puede lo que debe (38 comprobaciones)
```

Entra como `usuario@example.com` (`TestOnly123!`), sube un CSV en **Mis archivos** y pulsa **Analizar**. Elige las columnas (ya vienen sugeridas), confirma, y mira el informe. Descarga el CSV limpio. Para ver el ataque de la fase, sube un archivo con un producto que diga `=HYPERLINK("http://x","y")` y comprueba que en el CSV sale con una comilla delante.

### 2. La idea: lo que entra como texto puede salir como instrucción

En v0.8 el peligro era que un archivo dañara al sistema. Aquí es **lo inverso**: el sistema lee datos que escribió un desconocido y los **devuelve** (en una pantalla, en un informe, en un CSV que abrirá una hoja de cálculo). Tres cosas se vuelven peligrosas por el camino de vuelta:

| El dato… | Se vuelve… | La defensa |
|---|---|---|
| un nombre de columna con `<img onerror=…>` | **código en la pantalla** de otra persona (XSS) | React escapa todo; el worker recorta y limpia; nunca se pinta como HTML |
| un producto con `=HYPERLINK(…)` | **una fórmula** que ejecuta Excel al abrir el CSV | un solo sanitizador antepone `'` |
| una fecha `03/04/2026` | **un dato equivocado** sin que nadie lo note | se decide por la columna y, si se duda, el informe **avisa** |

### 3. El camino de un análisis

1. **Crear** (`api/src/analyses/analyses.service.ts`): solo un archivo mío y `accepted`; tope de 10 con candado; la API pone la llave de los resultados y encola **solo el id** en `atalaya:analyses`.
2. **Vista previa** (worker, `analysis_jobs.py` → `tabular.py` + `preview.py`): lee el archivo ya verificado (tamaño y SHA-256), saca columnas, ejemplos y un mapeo **sugerido** (por nombre, y por contenido para fecha e importe). Estado: `awaiting_mapping`.
3. **Mapeo** (`PUT /analyses/{id}/mapping`): la persona confirma. La API valida la **forma** (DTO) y el **sentido** (`mapping.ts`: columnas que existan en *ese* archivo y no repetidas). Un `UPDATE … WHERE status = 'awaiting_mapping'` decide quién gana una carrera.
4. **Limpieza** (`cleaner.py`): las reglas de abajo. Escribe el informe en la base y dos CSV en el volumen de resultados (`export.py`).
5. **Informe y descargas** (`web/src/app/analisis/[id]/`): las cifras, los problemas con ejemplos y los dos CSV.

El estado lo dice **todo**: el mensaje de la cola solo trae un id, y el worker decide qué hacer según el estado (`previewing` → vista previa; `queued` → limpiar; `running` → ya lo tomaron).

### 4. Las reglas de la limpieza

**Nada se descarta sin quedar contado.** Cada fila tira por **una sola razón** (la primera que falle, en este orden) y siempre se cumple `rowsKept + rowsDropped == rowsRead`.

| Problema | ¿Tira la fila? | Qué es |
|---|---|---|
| `blank_row` | sí | Fila vacía |
| `bad_date` / `future_date` | sí | Fecha ilegible, o del futuro |
| `bad_amount` / `bad_quantity` | sí | No es un número razonable |
| `duplicate_row` | sí | **Idéntica en todo lo mapeado** (un pedido con varias líneas NO es duplicado) |
| `negative_amount` / `zero_amount` | no | Devoluciones y ceros: se conservan, con aviso |
| `ambiguous_dates` | no | Se leyó día/mes/año por no haber pistas |
| `text_trimmed` / `text_truncated` | no | Espacios de más; texto de más de 200 caracteres |

Las fechas y los importes se leen **mirando toda la columna**: un primer número mayor que 12 prueba día/mes; `1.234,50` y `12,5` votan por la coma como decimal. La persona puede fijar cualquiera de los dos. Los importes son `Decimal`, nunca `float`, y el total sale como **texto decimal exacto** (`"110.75"`).

### 5. El sanitizador: una sola función, a propósito

```python
# worker/atalaya_worker/export.py
def safe_cell(text: str) -> str:
    return "'" + text if text.lstrip(_IGNORED_LEADING).startswith(_DANGEROUS_START) else text
```

- Neutraliza `=`, `+`, `-`, `@`, tabulador y retorno, **también tras espacios, saltos o NBSP** (algunas hojas los ignoran).
- Solo toca el **texto**. Los importes, cantidades y fechas salen tipados: un `-50.00` legítimo no se rompe.
- **Vive solo en el worker, y la API únicamente entrega los archivos.** Si la API generara CSV por su cuenta habría dos implementaciones de la misma regla de seguridad, y con el tiempo discreparían.
- **El costo, dicho claro:** Excel, al abrir un CSV, **muestra** la comilla (no la toma por marca de texto). Se prefirió un dato con una comilla de más a una fórmula que se ejecuta. La pantalla lo avisa.

### 6. Recorrido

| Archivo | Qué hace |
|---|---|
| `api/src/analyses/mapping.ts` | La regla del mapeo, pura: columnas que existan y no repetidas |
| `api/src/analyses/analyses.service.ts` | Crear, mapear, borrar y entregar; todo filtrado por dueño en la consulta |
| `worker/atalaya_worker/tabular.py` | Lee CSV y `.xlsx`: lo único que toca `openpyxl` (solo lectura, solo valores) |
| `worker/atalaya_worker/values.py` | Fechas e importes tal como los escriben las personas |
| `worker/atalaya_worker/cleaner.py` | Las reglas de la limpieza y el informe |
| `worker/atalaya_worker/export.py` | Los dos CSV y el sanitizador anti fórmulas |
| `worker/atalaya_worker/analysis_jobs.py` | El trabajo de punta a punta: etapas, marca de «ya empezó», cierre limpio |
| `web/src/app/analisis/[id]/mapping-form.tsx` | El formulario de mapeo completo, con la sugerencia elegida |
| `web/src/app/analisis/[id]/report-view.tsx` | El informe de calidad |

### 7. Un worker que muere a mitad, otra vez

En v0.8 se resolvía con el estado `checking`. Aquí **el contrato no tiene un estado de «trabajando en la vista previa»**, así que cada etapa pone una marca en Redis con `SET … NX EX 900`. Si el mensaje **vuelve** y la marca ya existe, la ejecución anterior murió a mitad: se cierra como `worker_timeout` y no se reabre. Usa el `set` que el worker ya tenía permitido: no hizo falta ampliar su ACL. Y el **latido va en otro hilo**: analizar 50 000 filas puede pasar de los 30 s que vale el latido y `/api/health` diría «worker caído» mientras trabaja.

### 8. Lo que sigue pendiente (y por qué)

- Un CSV en **latin1** (lo típico de Excel en español) se sigue rechazando.
- De un `.xlsx` solo se lee la **primera hoja** con datos.
- Solo se exporta a CSV, no a `.xlsx`: así hay una sola superficie de inyección.
- S-15: una pantalla con sesión válida manda a `/login` ante un 429 de `/auth/me`.
- Los indicadores, el Pareto, las anomalías y el pronóstico empiezan en **v0.10**: hoy el informe dice *«qué tan limpios venían tus datos»*, no *«cómo va tu negocio»*. *(Se hizo en v0.10, y de otra manera: los indicadores se calculan al final de la misma etapa de limpieza, con las filas ya limpias en memoria; no se repite la lectura del archivo.)*

---

## Capítulo v0.10: cuando el número miente sin que nadie mienta

> Lo nuevo: los **indicadores** de un análisis terminado (resumen, mes a mes, días de la semana, Pareto, anomalías y pronóstico con su error medido), el tipo **ventas o gastos**, la vista **Resultado** (ventas menos gastos) y las gráficas. Ataques y defensas en [`laboratorio/v0.10-informe.md`](laboratorio/v0.10-informe.md).

### 1. Preparar y probar

```bash
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # kind e insights en analyses (y el permiso del worker)
python3 scripts/generar_cafe.py                      # el café ficticio: 3 sucursales, 2 años, ventas y gastos
./scripts/permisos-worker.sh                         # el worker solo puede lo que debe (42 comprobaciones)
```

Entra como `usuario@example.com` (`TestOnly123!`). En **Mis archivos** sube `datos-ejemplo/cafe-ventas.csv` y `cafe-gastos.csv`; pulsa **Analizar ventas** en uno y **Analizar gastos** en el otro. Cuando terminen, abre **Resultado**, elige los dos y mira qué quedó cada mes. Prueba también `cafe-ventas-sucio.csv` para ver el informe de calidad con suciedad sembrada.

### 2. La idea: un indicador debe decir cuánto fiarse de él

Hasta v0.9 las defensas eran contra alguien que ataca. Aquí nadie ataca: un total pierde un centavo, «hoy» cae en mañana, una anomalía es en realidad la tendencia, un pronóstico se presenta sin su error. Son fallas de **exactitud** y de **honestidad**, y de cada una sale una regla:

| Regla | Qué evita |
|---|---|
| El dinero es **exacto de punta a punta**: `Decimal` en el worker, centavos enteros en la API, texto en el navegador | Un total que pierde un centavo (`0.1 + 0.2`) o dígitos con cifras grandes |
| «**Hoy**» es el de la zona del negocio (`America/Mexico_City`), no el UTC del contenedor | Una venta de hoy descartada como futura de 18:00 a 24:00 |
| Lo que no se puede analizar **se dice** (`insufficient_data`), no se inventa | Anomalías en gastos espaciados; pronósticos sobre casi puros ceros |
| Todo pronóstico trae **su error medido** (el backtest) | Una promesa sin su margen |
| La gráfica **nunca va sola**: lleva su tabla y no usa el color como único canal | Quien no ve colores o no usa ratón se queda sin la información |

### 3. El camino de los números

1. **La limpieza** (v0.9, `cleaner.py`) deja las filas válidas y el informe de calidad.
2. **Los indicadores** (`worker/atalaya_worker/insights.py`) se calculan **en la misma etapa**, con esas filas ya en memoria, y se guardan **junto con el informe en una sola sentencia** (`status = 'done'` + `report` + `insights`): un análisis no está «terminado» sin los dos. Un análisis de v0.9 no los tiene y la pantalla lo dice.
3. **La API** los entrega dentro del análisis y calcula el **resultado** (`GET /profit`) restando dos series mensuales con enteros de centavos (`money.ts`).
4. **La pantalla** los dibuja (`web/src/app/analisis/[id]/insights-view.tsx` y `web/src/app/resultado/page.tsx`).

### 4. Qué calcula cada indicador

| Indicador | Cómo | Ojo |
|---|---|---|
| Neto, bruto, devoluciones | Suma de todos los importes, de los positivos y de los negativos | El neto es **igual** al `totalAmount` del informe de calidad (una prueba lo exige) |
| Mes a mes | Neto por mes, con el cambio contra el mes anterior **con datos** | El primer y el último mes pueden estar incompletos: se avisa |
| Días de la semana | Promedio del total diario de cada día de la semana | Sobre los días que tienen datos |
| Pareto | Neto por elemento, los 20 mayores, % y % acumulado; clase A hasta el 80 %, B hasta el 95 %, C el resto | El que **cruza** el 80 % sigue siendo A; el acumulado se calcula sobre el valor exacto |
| Anomalías | Cada día contra el **mismo día de la semana de las 5 semanas de cada lado**; puntaje robusto con MAD, umbral 3,5 | Absorbe tendencia y temporada; con menos del 60 % de los días con datos, dice `insufficient_data` |
| Pronóstico | Promedio de las últimas 8 veces que cayó ese día de la semana, 14 días, con intervalo ±1,28 desviaciones | **Es un punto de partida, no un modelo**; trae su backtest (WAPE) |

### 5. Por qué el café encontró lo que mis pruebas no

Las primeras pruebas usaban un negocio sintético perfectamente regular, y pasaron todas. Al pasar por Atalaya los **730 días del café** (que crece 1,25 % al mes, con temporada y siete eventos sembrados) aparecieron tres defectos:

1. **Falsos positivos por tendencia.** El baseline era la mediana de *todos* los sábados: los de hace dos años, cuando el negocio era más chico, salían «bajos». De 10 anomalías, 5 eran falsas y dos eventos sembrados quedaban fuera. Con el baseline local: **7 de 7** eventos y 1 falso positivo.
2. **Gastos analizados por día de la semana.** La nómina del 15 salía como «anomalía». Ahora, con menos del 60 % de los días con datos, se dice que no hay suficientes.
3. **El Pareto de gastos salía vacío:** «categoría» no se reconocía como el elemento.

Los **totales coincidieron al centavo** con lo que el generador anotó (ventas 18 081 166.00 y gastos 12 885 026.79), y el resultado fue 5 196 139.21. La lección está en el laboratorio: un dato de prueba debe parecerse a los reales, o mide otra cosa.

### 6. Las gráficas

Hechas a mano en SVG (sin librería), con las reglas de la guía de visualización:

- **Una serie y un eje que arranca en cero.** Nunca dos ejes.
- **Barras delgadas** (máximo 24 px), con el extremo de datos redondeado y la base recta; cuadrícula de un pixel.
- **El valor solo en la barra extrema**, no uno por barra; el resto, en el tooltip y en la tabla.
- **Toda gráfica lleva su tabla equivalente** y un nombre accesible. El color (ámbar) nunca es el único canal: siempre hay una palabra al lado («pérdida», «más alto»).
- **Los colores se validaron con el script de la guía**, no a ojo: los del sitio fallaban la banda de luminosidad para marcas sobre fondo oscuro, y se definieron variantes más oscuras (`--chart-main`, `--chart-alert`) solo para las marcas.
- **En el teléfono** la gráfica conserva un ancho legible y se desplaza, y una serie de tiempo arranca al final (lo reciente).

### 7. Recorrido

| Archivo | Qué hace |
|---|---|
| `worker/atalaya_worker/tz.py` | «Hoy» en la zona del negocio; rechaza una hora sin zona |
| `worker/atalaya_worker/quant.py` | Del `Decimal` exacto al texto del contrato: se redondea una sola vez |
| `worker/atalaya_worker/indicators.py`, `pareto.py`, `anomalies.py`, `forecast.py` | Un cálculo por archivo |
| `worker/atalaya_worker/insights.py` | Los junta |
| `api/src/analyses/money.ts` | Dinero en centavos enteros (`BigInt`) |
| `api/src/analyses/profit.service.ts` | Ventas menos gastos, mes por mes |
| `web/src/components/column-chart.tsx`, `line-chart.tsx` | Las dos gráficas |
| `web/src/app/analisis/[id]/insights-view.tsx` | El informe de indicadores |
| `web/src/app/resultado/page.tsx` | La vista de resultado |
| `scripts/generar_cafe.py` | El café ficticio (determinista) |

### 8. Lo que sigue pendiente (y por qué)

- El pico de un día **contamina** el promedio de su día de la semana en el pronóstico (el método no lo filtra); no hay tendencia, feriados ni promociones.
- En las primeras y últimas 5 semanas de una serie solo hay vecinos de un lado, y con una tendencia fuerte las anomalías pueden equivocarse.
- Los **gastos** no tienen pronóstico ni anomalías (se dice); una versión mensual sería otra fase.
- Los indicadores **no se exportan** a CSV, a propósito: los nombres de producto y de sucursal son texto del archivo y abrirían otra superficie de inyección de fórmulas.
- Un CSV en **latin1** sigue rechazándose; de un `.xlsx` solo se lee la primera hoja.
- S-15: una pantalla con sesión válida manda a `/login` ante un 429 de `/auth/me`.
- Siguen sin probarse un Excel o LibreOffice reales y datos de un negocio real; el café es sintético.
