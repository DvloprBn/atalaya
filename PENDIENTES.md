# Pendientes de Atalaya

> Abiertos. Lo cerrado se tacha y se mueve al Historial del ESTADO en el siguiente barrido. Cada pendiente indica **quién** y **cuándo** (fase).

## Seguridad

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| S-1 | La contraseña de Redis va en los argumentos de `redis-server` y en las URLs (visible con `docker inspect`). En producción: archivo ACL montado y secretos de Docker. El usuario de Redis y el rol de base del worker **ya existen y son mínimos (v0.8)**; falta el archivo ACL y los secretos de Docker. | Claude | v1.0 (ACL y secretos) |
| S-2 | La CSP sigue en **solo reporte**. Ya hay recolector (v0.7) y los reportes se ven en el panel; falta observarlos un tiempo y pasar a bloqueo. | Claude | v1.0 (bloqueo) |
| ~~S-7~~ | ~~Intentos fallidos y robos de refresh sin bitácora, y sin aviso al dueño~~ **Resuelto en v0.7**: `security_events` + correo «Cerramos tus sesiones». | Claude | ✅ v0.7 |
| S-9 | La llave `TOTP_ENCRYPTION_KEY` no se puede rotar: no hay forma de re-cifrar los secretos con una llave nueva. El formato guarda una versión (`v1.`) para poder añadirlo. Y si se pierde, los secretos son irrecuperables (quedan los códigos de recuperación): respaldarla **aparte** de la base. | Claude | v1.0 |
| S-10 | Quien pierde el teléfono **y** los códigos de recuperación no puede entrar, y ningún admin puede quitarle el 2FA. Un sistema real necesita un proceso de recuperación asistida con verificación de identidad. | Claude (diseño) · Dueño (proceso) | v1.0 (extensión documentada) |
| S-11 | TOTP no resiste el phishing en tiempo real (una página falsa que reenvía el código). WebAuthn/passkeys ata la respuesta al dominio y sí lo resiste. | Claude | Después de v1.0 (extensión) |
| S-12 | **Google real sin probar de punta a punta:** todo se probó contra el servidor OAuth falso. Falta un cliente OAuth de Google (lo crea el dueño en Google Cloud Console, ver `docs/GUIA_RECORRIDO.md` §6 del capítulo v0.6) para comprobar la pantalla de consentimiento real, una cuenta de Workspace y la rotación real de llaves. | Dueño (opcional) | Antes de v1.0 |
| S-15 | **Un 429 o un 5xx de `/api/auth/me` manda a la persona a `/login`** (todas las pantallas con sesión hacen `if (!res.ok) router.replace('/login')`). Con el tope de 60/min por IP basta una oficina tras una misma IP, o un fallo momentáneo de la API, para que alguien con sesión válida «se salga». Debe redirigir solo ante 401 y mostrar un error reintentable en los demás casos. (Salió en la corrida completa de Chrome de v0.8.) | Claude | v1.0 (o antes, con una pantalla) |
| S-13 | Una cuenta solo-Google no tiene contraseña y no puede activar el 2FA ni desactivarlo sin crearla antes con «¿Olvidaste tu contraseña?». Mejora posible: re-autenticar con un inicio de sesión reciente de Google. | Claude | v1.0 (extensión) |
| ~~S-14~~ | ~~Rechazos de Google solo en el log~~ **Resuelto en v0.7**: `google_rejected` con su código, sin datos del intento. | Claude | ✅ v0.7 |
| S-8 | La contraseña no se compara contra listas de contraseñas filtradas (NIST lo recomienda). Opción sin terceros: una lista local de las más comunes. | Claude | v1.0 (movido desde v0.7) |
| S-3 | En producción la API debe negarse a arrancar con valores de ejemplo de `.env.example`. | Claude | v1.0 |
| S-4 | Las imágenes base van por etiqueta (`postgres:18-alpine`…), no por digest. En producción, fijar por digest. | Claude | v1.0 |
| S-5 | En desarrollo, `api` y `web` no son de solo lectura (la recarga escribe `dist/` y `.next/`). Las imágenes de producción sí lo serán. | Claude | v1.0 |
| S-6 | El tope de peticiones vive en la memoria del proceso: basta con una instancia, pero con varias habría que pasarlo a Redis. Efecto práctico hoy: la suite e2e cabe una vez cada 15 min (o reiniciando la API). | Claude | v1.0 (con 1 instancia no cambia nada; se decide al saber cuántas habrá) |

## Herramientas

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| H-1 | gitleaks no está instalado en la máquina (la instalación quedó bloqueada por los permisos del entorno de Claude). El pre-commit usa la imagen Docker `zricethezav/gitleaks:v8.30.1`. Opcional: instalarlo desde su release oficial verificando el checksum. | Dueño (opcional) | Cuando quiera |

## Siguiente fase (v0.8) — avance 2026-11-18
- ✅ Contrato, tabla `uploads` y módulo de subida en la API (19 pruebas e2e de ataque y 20 unitarias nuevas).
- ✅ Pantalla de archivos (`/archivos` y `/admin/archivos`): 6 pruebas nuevas en Chrome real (suite completa: 20).
- ✅ Worker (revisión profunda, rol de base y usuario de Redis mínimos): 37 pruebas de Python y 11 e2e de archivos hostiles; recuperación de un worker caído probada en vivo.
- ✅ Laboratorio v0.8 (19 fichas) y capítulo v0.8 de la guía; `scripts/permisos-worker.sh` (21 rechazos y 4 permisos reales, con falla plantada) y su paso en el CI.
- ⏳ **Falta en v0.8:** verificar el CI de GitHub con las dos contraseñas nuevas y el script de permisos; PR, CI y etiqueta (después de fusionar v0.7).
- Idea para el panel: avisar en la pantalla de Cuenta cuando hubo un robo de sesión reciente (hoy solo llega el correo).

## Siguiente fase (v0.9) — avance 2026-11-18
- ✅ Contrato (4 rutas), tabla `analyses` con sus CHECK y permisos del worker, volumen `results_data`, stream en el ACL de Redis, `permisos-worker.sh` ampliado (37 comprobaciones). Sin commit.
- ✅ Módulo de análisis en la API (crear, mapeo validado, tope con candado, exportación, retirada de CSV al borrar): 31 pruebas unitarias nuevas (236 en total) y flujo verificado en vivo con el worker simulado. Sin commit.
- ✅ Worker de análisis (lector, vista previa, limpieza con `Decimal`, informe, CSV con sanitizador anti fórmulas): 171 pruebas de Python y 11 e2e con el worker real; falla plantada en el sanitizador detectada. Sin commit.
- ✅ Pantallas de análisis (`/analisis`, `/analisis/[id]`, botón Analizar): 7 pruebas nuevas en Chrome real (suite completa: 27), con descarga real y un ataque XSS por encabezado de columna. Sin commit.
- ✅ Laboratorio v0.9 (33 fichas) y capítulo v0.9 de la guía.
- ⏳ **Falta en v0.9:** verificar el CI de GitHub (también el de v0.8, que sigue sin PR); push y PR.
- **Pendiente sin fase asignada:** CSV en latin1 (lo típico de Excel en español; se rechaza desde v0.8 y en v0.9 no se resolvió); solo se lee la primera hoja de un `.xlsx`.

## Siguiente fase (v0.10) — avance 2026-11-19
- ✅ Contrato (`kind`, `insights`, `GET /profit`), migración `analysis_insights` con sus CHECK y el permiso del worker, `permisos-worker.sh` ampliado (42 comprobaciones). Sin commit.
- ✅ API: `kind` al crear, `kind` e `insights` en la vista y `GET /profit` con centavos en `BigInt` (33 pruebas unitarias nuevas, 269 en total; e2e 111). Sin commit.
- ✅ Worker de indicadores (zona horaria, indicadores, Pareto, anomalías, pronóstico con su backtest), conformidad con el contrato como prueba y 3 e2e con el worker real; el tope general escala con `THROTTLE_SCALE`. Worker 234 pruebas. Datos de ejemplo del café ficticio (`scripts/generar_cafe.py`): su prueba de punta a punta corrigió tres defectos (baseline de anomalías, gastos espaciados, sinónimo de «categoría»). Sin commit.
- ✅ Pantallas de v0.10 (informe con gráficas y su tabla, `/resultado`, tipo ventas o gastos): 5 pruebas nuevas en Chrome real (suite completa: 32). Sin commit.
- ✅ Laboratorio v0.10 (32 fichas) y capítulo v0.10 de la guía.
- ⏳ **Falta en v0.10:** reescribir `ESTADO_PROYECTO.md`; subir la rama, PR y CI (primera vez con `openpyxl`, el café y el tope general escalable en GitHub).
- **Gestión:** etiquetas `v0.7`, `v0.8` y `v0.9` puestas el 2026-11-19; `ESTADO_PROYECTO.md` al día.

## Siguiente fase (v0.11) — avance 2026-11-19
- ✅ Contrato (`kind` con `xml` y `zip`, motivo `not_cfdi`, problemas `unsupported_document` y `unsupported_currency`) y diseño en `DECISIONES.md`. Sin commit.
- ✅ Migración `cfdi_kinds` (CHECK de `uploads.kind` y de `reject_reason` ampliados), probada. Sin commit.
- ⏳ **Falta en v0.11:** API (firma de `.xml` y `.zip`); worker (lector seguro de CFDI y de ZIP, tabla virtual, descartes contados, revisión profunda con XXE); un generador de CFDI sintéticos con los RFC de pruebas del SAT; pantalla (tipo de archivo, aviso de que no es una herramienta fiscal, etiquetas); pruebas de ataque (XXE y compañía); laboratorio y capítulo; PR.
- **Gestión:** etiqueta `v0.10` puesta el 2026-11-19 en `b5b4385`.
