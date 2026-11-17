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
