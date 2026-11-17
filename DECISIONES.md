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

