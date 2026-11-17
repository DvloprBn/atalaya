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

