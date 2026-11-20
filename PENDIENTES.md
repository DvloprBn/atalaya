# Pendientes de Atalaya

> Abiertos. Lo cerrado se tacha y se mueve al Historial del ESTADO en el siguiente barrido. Cada pendiente indica **quién** y **cuándo** (fase).

## Seguridad

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| ~~S-7~~ | ~~Intentos fallidos y robos de refresh sin bitácora, y sin aviso al dueño~~ **Resuelto en v0.7**: `security_events` + correo «Cerramos tus sesiones». | Claude | ✅ v0.7 |
| S-11 | TOTP no resiste el phishing en tiempo real (una página falsa que reenvía el código). WebAuthn/passkeys ata la respuesta al dominio y sí lo resiste. | Claude | Después de v1.0 (extensión) |
| S-12 | **Google real sin probar de punta a punta:** todo se probó contra el servidor OAuth falso. Falta un cliente OAuth de Google (lo crea el dueño en Google Cloud Console, ver `docs/GUIA_RECORRIDO.md` §6 del capítulo v0.6) para comprobar la pantalla de consentimiento real, una cuenta de Workspace y la rotación real de llaves. | Dueño (opcional) | Antes de v1.0 |
| ~~S-15~~ | ~~Un 429 o un 5xx de `/api/auth/me` mandaba a la persona a `/login`~~ **Resuelto 2026-11-19** (PR #10 fusionado en `main`): el hook `useMe` (`web/src/lib/use-me.tsx`) manda a `/login` solo ante un 401 y, ante un 429, un 5xx, la red caída o el tiempo agotado, muestra «Tu sesión no se cerró» con un botón «Reintentar». Lo usan las 9 pantallas con sesión. Prueba: `web/test/sesion.spec.ts` (falla plantada: con el comportamiento viejo cae). | Claude | ✅ 2026-11-19 |
| S-13 | Una cuenta solo-Google no tiene contraseña y no puede activar el 2FA ni desactivarlo sin crearla antes con «¿Olvidaste tu contraseña?». Mejora posible: re-autenticar con un inicio de sesión reciente de Google. | Claude | v1.0 (extensión) |
| ~~S-14~~ | ~~Rechazos de Google solo en el log~~ **Resuelto en v0.7**: `google_rejected` con su código, sin datos del intento. | Claude | ✅ v0.7 |
| S-16 | **Al desplegar (TLS y dominio):** Caddy con certificado, HSTS y `upgrade-insecure-requests` en la CSP (`web/src/lib/csp.ts`); y observar los reportes de la CSP **con tráfico real** unos días (la política en bloqueo se validó en local: 7 páginas sin violaciones, XSS reflejado bloqueado; no hubo periodo de observación porque no está desplegado). | Claude | v1.0 (despliegue) |
| S-17 | Los archivos de `secrets/` son legibles (444) porque Docker los monta tal cual y los contenedores corren con otros usuarios; los protege la carpeta (700). En un servidor compartido con otras cuentas, pasar a secretos de Swarm o a permisos por usuario. | Claude | Al elegir el servidor |
| S-18 | **Proceso humano de verificación de identidad de S-10:** Claude dejó una propuesta de 5 pasos en `docs/laboratorio/v1.0-recuperacion-2fa.md` §D (p. ej. «nunca por el mismo canal por el que llegó la petición»). Fuente: el dueño eligió la opción 1 de S-10 el 2026-11-20 («vamos como recomiendas»); el `PENDIENTES` anterior ya le asignaba el proceso a él. Revisarla y ajustarla. | Dueño | Antes de cerrar v1.0 |
| S-6 | El tope de peticiones vive en la memoria del proceso: basta con una instancia, pero con varias habría que pasarlo a Redis. Efecto práctico hoy: la suite e2e cabe una vez cada 15 min (o reiniciando la API). | Claude | v1.0 (con 1 instancia no cambia nada; se decide al saber cuántas habrá) |

## Herramientas

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| H-2 | `api/package.json` lleva `overrides` con `effect` 3.22.4 por GHSA-7589-6fvf-x4pw (llega por `prisma` 7.10.1 → `@prisma/config`, que fija 3.20.0). Quitarlo cuando una Prisma 7 **estable** traiga `effect` corregido (no la RC de la 8 que hoy marca `latest`), y comprobar que `npm audit --omit=dev` sigue limpio. | Claude | Al subir Prisma |
| H-3 | El CI no construye las imágenes de producción (`api/Dockerfile`, `web/Dockerfile`, objetivos `runtime` y `migrate`) ni levanta `docker-compose.prod.yml`: una ruptura ahí no la vería nadie hasta desplegar. Agregar un trabajo que las construya y corra el recorrido básico con secretos de un solo uso. | Claude | v1.0 |
| H-4 | Los digests de las imágenes base (S-4) se actualizan **a mano** (`docker buildx imagetools inspect`). Proponer al dueño cómo: revisión mensual a mano o un bot de actualizaciones con revisión. | Claude (propuesta) | v1.0 |
| H-1 | gitleaks no está instalado en la máquina (la instalación quedó bloqueada por los permisos del entorno de Claude). El pre-commit usa la imagen Docker `zricethezav/gitleaks:v8.30.1`. Opcional: instalarlo desde su release oficial verificando el checksum. | Dueño (opcional) | Cuando quiera |

## Datos y negocio

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| D-1 | CSV en latin1 (lo típico de Excel en español): se rechaza desde v0.8. | Claude | Sin fase asignada |
| D-2 | De un `.xlsx` solo se lee la primera hoja. | Claude | Sin fase asignada |
| D-3 | Excel o LibreOffice reales y datos de un negocio real sin probar. Candidato: Online Retail II de UCI (CC BY 4.0); descargarlo requiere el permiso del dueño. | Dueño (permiso) · Claude | Antes de v1.0 |
| D-4 | Un PDF cuya tabla **no tiene líneas** (una hoja de Calc o Excel exportada sin cuadrícula: el caso más común) sale `no_table`. Se probó la estrategia de pdfplumber que alinea texto y, con una hoja real exportada por LibreOffice, pegó la fecha con el producto, partió «Café de olla» en tres columnas y perdió el encabezado: cifras equivocadas sin aviso, peor que rechazar. Mientras tanto, el mensaje de `no_table` dice qué hacer (subir el `.xlsx`/`.csv` original o exportar con la cuadrícula). | Claude | Sin fase asignada |

## Pruebas

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| P-1 | Una vez, 3 pruebas de `twofactor` fallaron en una corrida partida en dos y no reproduce. Sin explicar. | Claude | Si vuelve a salir |
| P-2 | Una vez (CI del 2026-11-19, commit `9a9e4dc`) la API dejó de responder entre la semilla y el smoke: fallaron justo las 11 comprobaciones que pasan por ella. En 6 intentos aquí (uno con medio núcleo por contenedor) no se reprodujo; la siguiente corrida del CI pasó. El CI ya imprime, si algo falla, el estado de cada contenedor (salida, `OOMKilled`, reinicios) y el registro completo de la API: si vuelve, leerlo con `gh run view --log-failed`. | Claude | Si vuelve a salir |

## Ideas sin fecha
- Avisar en la pantalla de Cuenta cuando hubo un robo de sesión reciente (hoy solo llega el correo). Claude.
- S-8 usa una lista **local y corta** de contraseñas comunes, no una de filtraciones reales. Si algún día se quiere la comparación completa: «Have I Been Pwned» por k-anonimato (se manda solo el inicio del hash), con un tercero de por medio. Claude.

## Cerrados
- ~~S-1, S-3, S-4, S-5~~ (2026-11-20, commit `88fe564`, rama `fase/v1.0-produccion`): `docker-compose.prod.yml` sin contraseñas en `environment`/`command` (secretos en `secrets/`, `scripts/arranque-prod.sh`, ACL de Redis con hashes generado en memoria, `POSTGRES_PASSWORD_FILE`); la API se niega a arrancar en producción con valores de ejemplo; imágenes por digest; imágenes de producción de API y web y todos los contenedores en solo lectura. Probado levantando el stack: recorrido de registro a exportación y ninguna contraseña en `docker inspect`.
- ~~S-8~~ (2026-11-20, `c764973`): contraseñas comunes rechazadas en registro, restablecer e invitación (`passwordProblem()`); lista local (ver «Ideas»). e2e en las tres puertas.
- ~~S-2~~ (2026-11-20, `43dd155`): CSP con nonce por petición desde `web/src/proxy.ts`; en bloqueo en producción (`CSP_ENFORCE=1`), solo reporte en desarrollo. Lo que falta de observar con tráfico real pasó a S-16.
- ~~S-9~~ (2026-11-20, `49cb924`): llavero de la llave del 2FA, formato `v2.<kid>`, comando `rotar-llave-totp` y aviso al arrancar; ensayo en vivo en `docs/laboratorio/v1.0-rotacion-totp.md`.
- ~~S-10~~ (2026-11-20, `49cb924`): recuperación asistida (opción del dueño: admin + 48 h + correo para cancelar); `docs/laboratorio/v1.0-recuperacion-2fa.md`. El proceso humano quedó como S-18.
- ~~Bloques de avance «Siguiente fase» de v0.8, v0.9, v0.10 y v0.11~~ (2026-11-19): todo lo que decían está hecho y fusionado; el texto íntegro está en `docs/historial/PENDIENTES_COMPLETOS_2026-11-19.md`, líneas 33-64 (v0.8: 33-40, v0.9: 41-49, v0.10: 50-58, v0.11: 59-64).
- Etiquetas `v0.1` a `v0.11` puestas; `main` contiene hasta v0.11 y S-15.
