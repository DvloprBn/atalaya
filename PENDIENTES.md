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
| ~~S-15~~ | ~~Un 429 o un 5xx de `/api/auth/me` mandaba a la persona a `/login`~~ **Resuelto 2026-11-19** (PR #10 fusionado en `main`): el hook `useMe` (`web/src/lib/use-me.tsx`) manda a `/login` solo ante un 401 y, ante un 429, un 5xx, la red caída o el tiempo agotado, muestra «Tu sesión no se cerró» con un botón «Reintentar». Lo usan las 9 pantallas con sesión. Prueba: `web/test/sesion.spec.ts` (falla plantada: con el comportamiento viejo cae). | Claude | ✅ 2026-11-19 |
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

## Ideas sin fecha
- Avisar en la pantalla de Cuenta cuando hubo un robo de sesión reciente (hoy solo llega el correo). Claude.

## Cerrados
- ~~Bloques de avance «Siguiente fase» de v0.8, v0.9, v0.10 y v0.11~~ (2026-11-19): todo lo que decían está hecho y fusionado; el texto íntegro está en `docs/historial/PENDIENTES_COMPLETOS_2026-11-19.md`, líneas 33-64 (v0.8: 33-40, v0.9: 41-49, v0.10: 50-58, v0.11: 59-64).
- Etiquetas `v0.1` a `v0.11` puestas; `main` contiene hasta v0.11 y S-15.
