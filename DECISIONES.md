# Decisiones de Atalaya

> Lo que el dueño ya decidió. No se vuelve a preguntar; si algo nuevo choca con esto, gana lo registrado y se avisa.

## 2026-11-17 — Arranque (dueño)
- Nombre **Atalaya**. Proyecto de **estudio** en `dvlopmnt/atalaya/`; repo **público**, licencia **MIT**.
- **Desde cero.** OmniUser (`dvlopmnt/login`) es solo referencia.
- No es básico: «mejora todo lo posible», pero sigue siendo de estudio y fácil de leer, sin código innecesario.
- **6 roles** con jerarquía: usuario → staff → manager → admin → director → super.
- Registro público **con verificación de correo**: Mailpit en local; en el demo, el servicio de correo del portafolio (Resend).
- **Google OAuth entra** (v0.5), con sus pruebas API7/API10.
- **Gemelo en Django + DRF** (lo recomendado, priorizando seguridad); empieza solo al terminar Atalaya.
- **Front único en Next.js**, también para el gemelo. Las variantes de front en Python no son el camino principal.
- **Análisis de datos de un negocio:** primero ventas en Excel/CSV, pero los demás formatos (gastos, CFDI XML, PDF) se diseñan desde el inicio y se construyen por fases.
- El **admin no ve el contenido** de los archivos de un cliente, solo metadatos.
- **Demo:** cuenta de prueba con límites claros que permita probar todo; borrado automático a las 24 h con aviso visible; datos de ejemplo obligatorios, sintéticos o abiertos tipo Kaggle, nunca reales de personas. Vive dentro de dvlopr-bn como caso de estudio.
- Código en inglés, documentación en español. Git con rama por fase, PR revisado y etiqueta por fase. Una sola guía de recorrido.
- Partes **A (acceso) y B (análisis)** en un mismo repo; A primero.

## 2026-11-17 — Técnicas (propuesta aprobada con «sí, adelante»)
- Docker para todo; dos redes (`edge` y `data` interna). El worker solo en `data`, de solo lectura, sin root, con límites.
- Caddy es la única puerta (`127.0.0.1:3070`) y pone las cabeceras de seguridad en un solo lugar. La API vive en el mismo dominio, en `/api` (cookies sin cruzar dominios, sin CORS).
- Contraseñas con **Argon2id** (el gemelo Django las lee igual).
- **TypeScript 6.0.3 en api y 5.9.3 en web:** el CLI de Nest 12 exige `~6.0.2` y openapi-typescript 7.13 exige TS 5. Forzar con `--legacy-peer-deps` sería un parche; dos versiones, cada una soportada, no lo es.
- **Prisma 7.10.1 fijado:** la etiqueta `latest` de npm apunta a 8.0.0-rc.
- **vitest 4.1** (la misma que ya funciona en dvlopr-bn), no la 5.
- Lint con `oxlint --deny-warnings`: sin esa opción, las advertencias no fallan.
- Fuera de alcance, a propósito: organizaciones (varias personas por negocio).

## 2026-11-17 — v0.2 (diseño de Claude, dentro de lo aprobado)
- **Registrarse no crea al usuario:** crea un enlace pendiente con el hash de la contraseña; el usuario nace al verificar. Evita el pre-secuestro y las cuentas basura.
- **Restablecer la contraseña entra en v0.2** (comparte la maquinaria de enlaces por correo). No estaba asignado a ninguna fase.
- **Dos cookies:** acceso `__Host-` (JWT de 10 min) y refresh `__Secure-` con `Path=/api/auth` (opaco, de un solo uso, rotado; sesión de 7 días). `Secure` también en local: navegadores y curl tratan localhost como seguro.
- **La sesión se revisa en la base en cada petición.** Logout, restablecimiento y robo detectado cortan el acceso al instante. Hace innecesaria una lista negra de `jti` en Redis.
- **Robo de refresh:** reuso de uno rotado = se revocan todas las sesiones, salvo una carrera con evidencia (rotado hace menos de 10 s y su sucesor **directo** sin usar).
- **Correos por bandeja de salida** (`mail_outbox`) con despachador cada 5 s; el cuerpo se borra al enviarse. Un solo `SMTP_URL` para Mailpit y para Resend (SMTP).
- **Topes:** por IP y ruta (Nest), por cuenta para el login (10 fallos en 15 min, Redis) y por destinatario **y propósito** para correos (1 por minuto), más 200 correos por hora en total.
- **CSRF:** `SameSite=Strict` + guarda de `Sec-Fetch-Site`/`Origin` en toda petición que cambia algo.
- **Contraseñas:** Argon2id (19 MiB, t=2, p=1), de 12 a 128 caracteres y sin la parte local del correo; sin reglas de composición (NIST 800-63B).
- **Pruebas por capas:** unitarias (vitest), ataques contra la API viva con Mailpit (vitest e2e) y el recorrido en Chrome real (Playwright con `channel: 'chrome'`, sin descargar navegadores). Cada suite se validó con una falla plantada.
- Login: tope por IP de 20 por minuto (antes 10): varias personas comparten IP (oficina, red del celular); la defensa principal contra adivinar contraseñas es el tope por cuenta.
- En CI la migración y la semilla son pasos explícitos (`prisma migrate deploy`, `db seed`); la API no migra sola al arrancar (lección 146).

## 2026-11-17 — Cambio del dueño: Atalaya SÍ lleva interfaz
- Reemplaza «sin UX/UI, solo el esqueleto». El dueño (tras cerrar v0.3): una interfaz **innovadora, tecnológica, que parezca de ciencia de datos, llamativa y relativamente sencilla**. Dirección visual por elegir entre tres propuestas originales.
- **Elegida la dirección A, «Observatorio»** (2026-11-17): fondo azul noche, turquesa para lo normal y ámbar para lo anómalo, cifras en monoespaciada, radar de anomalías como pieza central. Las tres viven en un lienzo de diseño privado del dueño (fuera del repo).
- **La interfaz es su propia fase, `v0.4`**, antes del 2FA (recomendación de Claude, aplicada sin objeción del dueño): las fases siguientes se recorren una posición; la demo sigue en `v1.0`.

## 2026-11-17 — v0.3 (diseño de Claude, dentro de lo aprobado)
- **Jerarquía estricta:** solo se ve y se gestiona lo de nivel menor al propio; nadie se gestiona a sí mismo. La regla vive en `admin/hierarchy.ts` (en memoria y como filtro de Prisma, con una prueba que exige que coincidan).
- **Dos capas:** `@MinLevel` + `RolesGuard` para la función (403) y la jerarquía para los objetos (404, para no confirmar que existen).
- **El panel de cuentas exige nivel admin (3).** Staff y manager no tienen panel todavía.
- **Alta de personal por invitación:** la cuenta nace sin contraseña y la persona la elige con un enlace de 72 h; nadie más conoce su contraseña. Aceptar verifica el correo (lección 45). Restablecer también verifica una invitación pendiente.
- **Tope de cuentas activas por rol** (1 director, 1 super) con candado sobre la fila del rol; las desactivadas no cuentan; reactivar revisa el tope.
- **Desactivar revoca todas las sesiones** (motivo `account_disabled`); reactivar no las revive.
- **Cambios con candado de fila** (`FOR UPDATE`) y revisión de jerarquía con el dato bloqueado.
- **Roles por nombre en la API**, nunca por id. Sin borrado de cuentas: se desactivan.
- **Inventario de rutas contra el contrato** como prueba unitaria: rutas iguales y públicas iguales.

## 2026-11-17 — v0.5 (diseño de Claude, dentro de lo aprobado)
- **TOTP escrito a mano** (`totp.ts`, ~60 líneas) en vez de una librería: se estudia entero, no hay dependencia que auditar, y se valida con los **vectores oficiales del RFC 6238** y contra `pyotp` (el gemelo en Django leerá el mismo secreto).
- **Ventana ±1 paso (30 s)** y **anti-repetición**: solo vale un paso mayor al último aceptado, con `UPDATE` condicionado atómico. Activar el 2FA gasta el código del instante.
- **El secreto se guarda cifrado con AES-256-GCM**, llave en el entorno (`TOTP_ENCRYPTION_KEY`, 64 hexadecimales, validada al arrancar) y el **id del usuario como dato asociado (AAD)**: un secreto no se puede mover a otra cuenta.
- **Códigos de recuperación:** 10 de 80 bits (`XXXX-XXXX-XXXX-XXXX`), un solo uso, guardados solo con SHA-256; se muestran una vez. Regenerarlos pide contraseña y código y anula todos los anteriores.
- **Login en dos pasos con un reto** (token puente): opaco, 5 minutos, en Redis solo su hash, canje atómico (`GETDEL`), máximo 5 intentos. La contraseña buena con 2FA activo **no crea sesión ni cookies**.
- **Topes del segundo factor:** por reto (5), **por cuenta** (10 fallos/15 min, sin escalar) y por IP (10/min en `verify`). Todo fallo de contraseña o código en las rutas de gestión suma al mismo contador por cuenta, y el mensaje es siempre «Contraseña o código incorrectos».
- **Activar pide la contraseña** (una sesión robada no puede enlazar el teléfono del atacante) y **cierra las demás sesiones**; **desactivar y regenerar piden contraseña y código**. Motivo nuevo de revocación: `two_factor_changed`.
- **Un 2FA pendiente de confirmar no cuenta:** no protege ni bloquea el login.
- **`THROTTLE_SCALE`:** los topes por IP de las rutas de acceso se multiplican en desarrollo y CI (5) porque todas las suites salen de una misma IP; en producción vale 1 y otro valor impide arrancar. El tope por cuenta no se escala. Una prueba (`zz-throttle`) comprueba que el 429 existe y nunca llega antes del valor de producción.
- **Sin recuperación asistida por un admin** (quien pierde teléfono y códigos queda fuera) y **sin WebAuthn/passkeys**: se dejan documentados como límites en PENDIENTES.
- El QR se entrega como SVG y se muestra dentro de un `<img>` con URI de datos (nunca como HTML).

## 2026-11-17 — v0.6 (opción A elegida por el dueño)
- **Opción A:** todo contra un **servidor OAuth falso local** (`mock-idp/`); el cliente real de Google se agrega después con solo poner seis variables `OAUTH_*` en `.env`. La opción B (probar el botón real) queda pendiente del dueño.
- **Authorization Code + PKCE (S256) + `state` + `nonce`**, con el intento en Redis (10 min, un solo uso, solo hashes) y **atado al navegador con una cookie `__Host-` `SameSite=Lax`** (Lax y no Strict: el regreso desde Google es una navegación entre sitios).
- **`id_token` verificado a mano** (`id-token.ts`): algoritmo fijo RS256, llave por `kid` del JWKS, tamaño de módulo ≥ 2048 bits, emisor, audiencia (+`azp`), vigencia con 60 s de tolerancia, `nonce` en tiempo constante y `email_verified === true` estricto. Escrito en vez de usar una librería: se estudia entero y no hay dependencia que auditar.
- **Identidad por `sub`, nunca por correo** (`oauth_identities`, únicas por `(provider, subject)` y por `(user_id, provider)`). Vincular a una cuenta existente solo si su correo ya está verificado, y **siempre se avisa por correo** al dueño. Una cuenta nueva nace `usuario`, sin contraseña y verificada.
- **El 2FA no se salta con Google:** el regreso da un reto en el fragmento (`/login#challenge=…`) y la sesión nace al canjearlo.
- **Respuesta uniforme:** cualquier fallo → `/login?error=google`; el motivo (código fijo, sin datos) va solo al log. Destinos de redirección **fijos** (sin open redirect).
- **Consumo seguro del proveedor:** URLs de la configuración, sin redirecciones, 5 s de tiempo límite (con prueba guardián), 64 KB, solo JSON; llaves en caché 10 min y como máximo una descarga extra cada 30 s; en producción solo HTTPS (otro valor impide arrancar).
- **Una cuenta solo-Google no tiene contraseña:** activar el 2FA devuelve un `409` claro («crea una con ¿Olvidaste tu contraseña?»). Mejor mensaje y salida explícita que un «contraseña incorrecta».
- **Solo el alcance `openid email`:** Atalaya no pide ningún permiso sobre la cuenta de Google.
- **Defensa en capas, medida:** al quitar la revisión del algoritmo o la de «ya tiene otra cuenta de Google», la suite viva sigue en verde (la firma RS256 fija y la restricción única de la base lo rechazan igual) y las unitarias caen. Se mantienen **ambos** niveles de prueba.

## 2026-11-18 — v0.7 (diseño de Claude, dentro de lo aprobado)
- **Dos tablas, no una:** `security_events` (lo que intentan contra el sistema; mejor esfuerzo, nunca rompe la petición) y `audit_logs` (quién hizo qué; **dentro de la transacción** de la acción, «sin registro no hay acción»).
- **IP como HMAC** con llave del servidor (`JWT_SECRET` con etiqueta de dominio `atalaya:ip-hash:v1`), no SHA-256 simple. En el panel solo un prefijo de 8 caracteres: sirve para «mismo origen».
- **Tipos cerrados** (CHECK en la base + `@IsIn` + enum del contrato): agregar un tipo es una migración nueva a propósito.
- **Dedupe solo en los ruidosos** (`rate_limited`, `csp_violation`, `login_locked`): una línea por minuto, tipo, origen y detalle. `login_failed` **no** lleva dedupe: ya lo limita el tope por IP, y el conteo de intentos es información que sí interesa.
- **Jerarquía también en la bitácora:** el correo de una cuenta solo aparece si está por debajo de quien mira o es la suya; si no, `user: null`.
- **Aviso al dueño ante robo de sesión (S-7):** correo sin ningún token ni enlace con secreto; solo manda a «cambiar mi contraseña». Se envía una vez (tras revocar, el segundo intento ya no llega a ese punto).
- **CSP:** `report-uri` (sigue en solo reporte; el bloqueo es de v1.0). El recolector guarda **directiva + host**, nunca ruta, parámetros ni fragmento. Un JSON que no es reporte responde 204 igual; lo que no es JSON de objeto/arreglo da 400 y más de 16 KB, 413 (del analizador de cuerpos, no se reescribe).
- **«Día de ataque»** (radar): ≥ 10 eventos en el día UTC, o cualquier `refresh_reuse`. Un solo criterio en `web/src/lib/security-view.ts`.
- **S-6 (tope en Redis) sigue abierto** a propósito: con una sola instancia no cambia nada y se decide en v1.0. **S-8 (contraseñas filtradas)** también pasa a v1.0.
- **Retención de 90 días**, poda al arrancar y cada 6 h.


## 2026-11-18 — v0.8, contrato (diseño de Claude, dentro de lo aprobado; sin código aún)
- **Revisión en dos tiempos.** La API rechaza antes de guardar lo barato y seguro de verificar (tamaño 5 MB → 413; firma de los primeros bytes ≠ CSV/XLSX o ≠ extensión → 415; `.xlsm`/`.xlsb`/`.xls` → 415; 10 archivos por cuenta → 409). El worker, ya encolado, hace lo caro (bomba zip, entradas de más, rango de hoja gigante, XML roto) y deja `rejected` con un motivo de lista cerrada. El worker **repite** la comprobación de firma (defensa en capas).
- **Tipo por firma, no por extensión ni Content-Type.** El nombre original no es ruta: se guarda con nombre generado y solo se muestra saneado (`displayName`).
- **Rutas:** `POST/GET /uploads`, `GET/DELETE /uploads/{id}`, `GET /admin/uploads`. Subida responde **202** (la revisión profunda es asíncrona).
- **404 y no 403** para el archivo de otra cuenta, también para un admin. El admin solo ve metadatos (dueño, tamaño, tipo, estado, fecha): no hay ruta para contenido ni nombre original (decisión de arranque).
- **Motivos de rechazo cerrados** (`zip_bomb`, `too_many_entries`, `range_too_large`, `corrupt`, `empty`, `worker_timeout`): nunca texto libre del archivo ni del error interno.
- **Fuera del contrato a propósito (se decide al construir):** dónde se guardan los bytes, el formato del mensaje en la cola, y el rol de base y usuario de Redis del worker (S-1). El contrato no los expone.
- **Costo señalado:** `route-inventory.spec.ts` fallará hasta que los controladores existan; es lo esperado de «contrato primero».
- **Esquema (tabla `uploads`, migración `20261118204408_uploads`):** solo metadatos; los bytes irán en un volumen bajo `storage_key` (32 hex generados por el servidor, con CHECK: ninguna ruta del usuario cabe). `sha256` para que el worker confirme que lee lo que la API guardó. Dueño con `ON DELETE CASCADE`. CHECK de tipo, estado, motivo (lista cerrada), tamaño (1 B – 5 MB), hex, **motivo si y solo si rechazado** y **fecha de revisión si y solo si terminó**. `delete_requested_at` cubre el borrado mientras el worker revisa.
- **El tope de 10 archivos por cuenta NO está en la base:** se impone en la API con `pg_advisory_xact_lock` por cuenta + conteo dentro de la transacción (dos subidas simultáneas no deben colarse). Se prueba con una carrera en el e2e.
- **Módulo de subida de la API (`api/src/uploads/`):** `file-signature.ts` decide por BYTES (zip + `[Content_Types].xml` + `xl/workbook.xml` para xlsx; sin `vbaProject.bin`; OLE y firmas de PDF/exe/HTML/XML descartadas para csv; sin bytes nulos); la extensión solo debe COINCIDIR. Los bytes van al volumen `uploads_data` (la API escribe; el worker lo monta **solo lectura**), con nombre de 32 hex generado y `wx` (nunca pisa). El mensaje de la cola (Redis Stream `atalaya:uploads`) lleva **solo el id**.
- **CSV solo en UTF-8 (a propósito, por ahora):** un CSV en latin1 (típico de Excel en español) se rechaza con 415 y un mensaje que lo dice. Costo: es una fricción real para quien exporte de Excel; se revisa en v0.9 (lector de ventas) con detección de codificación, no antes.
- **Si encolar falla, se deshace todo** (fila y archivo) y se responde 503: una fila «en cola» que nadie procesará es peor que un error claro. Un archivo borrado mientras el worker lo revisa se **marca** (`delete_requested_at`) y una poda de la API (cada minuto) borra fila y archivo, porque el worker no tendrá permiso de borrar.
- **Topes de la subida:** 10 por minuto por IP (escalado en dev), 10 archivos por cuenta (con candado), 5 MB, 1 solo campo. multer con `fileSize` corta el cuerpo mientras llega.
- **Dependencia nueva:** `@types/multer@2.3.0` (solo tipos; multer ya venía con `@nestjs/platform-express`). `tsconfig` agrega `multer` a `types`. Un `prisma format` realineó espacios del schema (sin cambio de significado).

## 2026-11-18 — v0.8, worker (diseño de Claude, dentro de lo aprobado)
- **Revisión profunda** (`worker/atalaya_worker/`): lee el archivo con `O_NOFOLLOW`, confirma tamaño y **SHA-256 contra lo que guardó la API** (el worker no se fía de ella) y repite la firma. xlsx: entradas ≤ 500, descomprimido ≤ 50 MB y razón ≤ 100:1 (se mide con la cabecera Y contando los bytes reales que salen, porque la cabecera puede mentir), sin cifradas, sin rutas `..`, sin nombres repetidos, sin macros; el XML se lee con `defusedxml` (DTD y entidades prohibidos → XXE y «billion laughs» caen como `corrupt`) y por trozos con `clear()` (la memoria no crece); rango declarado o real > 50 000 filas o > 200 columnas → `range_too_large`. csv: UTF-8, `strict`, ≤ 50 000 filas y 200 columnas, celda ≤ 1 MB, y «solo encabezado» = `empty`.
- **Los motivos son los del contrato.** Un xlsx con macros o con ruta traicionera sale como `corrupt` (no se agregó un motivo nuevo: sería otra migración y otro cambio de contrato).
- **Tiempo:** 20 s por archivo con `SIGALRM` → `worker_timeout` (el latido caduca a los 30 s).
- **Un archivo que ya mató al worker una vez no se reabre.** `claim` toma la fila con `FOR UPDATE` en una sola sentencia y dice si ya estaba en `checking`; en ese caso se cierra como `worker_timeout` sin revisarlo. Un fallo inesperado de la revisión se cierra como `corrupt`: nunca queda en `checking` ni se reintenta en bucle. Un error de la base **no se confirma** (XACK): el mensaje se reintenta.
- **S-1, parte del worker, cerrada:** rol de base `atalaya_worker` (migración `uploads_worker_role`: sin LOGIN en la migración, **permisos por columna** sobre `uploads`: lee `id, kind, sha256, size_bytes, storage_key, status, delete_requested_at` y actualiza solo `status, reject_reason, checked_at`; sin acceso a `users`, sesiones ni bitácora; `statement_timeout` 15 s) y usuario de Redis `worker` (solo `xgroup|create`, `xreadgroup`, `xack`, `set`, y solo las llaves `atalaya:uploads` y `atalaya:worker:*`). Se **comprobó en vivo** que 12 consultas y 8 comandos fuera de ese perímetro fallan.
- **Contraseñas:** `WORKER_DB_PASSWORD` y `WORKER_REDIS_PASSWORD` van en `.env` (obligatorias: el compose no arranca sin ellas). El servicio `db-roles` (una vez, al arrancar) le pone LOGIN y contraseña al rol. Siguen en los argumentos de `redis-server` y en el entorno: S-1 mantiene el resto para v1.0 (archivo ACL y secretos de Docker).
- **Costo:** dos servicios nuevos que depender de `.env`; el CI genera las dos contraseñas. `docker-compose.ci.yml` ahora conserva el volumen de subidas de la API (con `!override`).
- **Dependencias del worker:** `psycopg[binary]` 3.3.9 y `defusedxml` (fijadas en `uv.lock`). `ruff` sube de 110 a 130 columnas (los comentarios del porqué en español).

## 2026-11-18 — v0.8, pantalla de archivos (diseño de Claude, dentro de lo aprobado)
- **Dos pantallas:** `/archivos` («Mis archivos»: subir, ver estado, borrar) y `/admin/archivos` (solo metadatos, nivel admin; el admin NO ve el nombre del archivo). Enlaces en el marco: «Mis archivos» para todos y «Archivos de las cuentas» desde nivel 3 (ocultar un enlace no protege nada; protege la API).
- **La revisión del navegador es de cortesía, no de seguridad** (extensión, 0 bytes, 5 MB): ahorra una subida inútil; la API vuelve a revisar todo por firma de bytes. Los motivos de rechazo se traducen a una frase en `web/src/lib/upload-view.ts`; uno desconocido se muestra genérico, nunca el texto crudo.
- **Sondeo con retroceso** (2 s → 8 s) mientras algún archivo esté en cola o revisando, y se detiene al resolverse. Uno fijo cada 1,5 s gastaba ~40 de las 60 peticiones por minuto que permite cada ruta por IP.
- **`/auth/me` usa `scaled(60)`:** en producción vale 60 (igual que antes); en desarrollo y CI, 300. Razón: cada pantalla la pide al cargar y la suite de Chrome (20 pruebas, una sola IP) agotaba el tope; es la misma razón de `THROTTLE_SCALE`. Las suites siguen necesitando reiniciar la API entre corridas completas.
- **S-15 (nuevo, abierto):** las pantallas mandan a `/login` ante CUALQUIER error de `/me`, no solo ante un 401: un 429 o un 5xx le «sacan» la sesión a quien la tiene válida. Se vio en la prueba al agotar el tope; se corrige aparte, no se mezcló con la pantalla de archivos.
