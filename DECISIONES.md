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
- En CI la migración y la semilla son pasos explícitos (`prisma migrate deploy`, `db seed`); la API no migra sola al arrancar (lección 146).
