# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-18**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-18

**Fase actual:** `v0.8` **construida, verificada, comiteada y subida** en la rama `fase/v0.8-subida` (3 commits, apilada sobre `fase/v0.7-bitacora`). Falta: fusionar el PR de v0.7, abrir el de v0.8, el CI de GitHub y la etiqueta. Siguiente fase: `v0.9` (lector de ventas, mapeo de columnas, limpieza e informe de calidad).

**Qué hay en v0.8 (verificado el 2026-11-18):**
- **Contrato** `/uploads` (POST 202, GET, GET/DELETE por id) y `/admin/uploads` (solo metadatos). Tabla `uploads` (migración `20261118204408_uploads`) con CHECK: tipo, estado, motivo de rechazo de lista cerrada, tamaño, hex, «motivo sii rechazado» y «fecha de revisión sii terminó».
- **API** (`api/src/uploads/`): tipo por **firma de bytes** (no por extensión), sin `.xlsm` ni macros, 5 MB cortado mientras llega, un solo campo, tope de 10 archivos por cuenta con candado, 404 (no 403) en archivos ajenos, bytes en un volumen con nombre generado por el servidor, cola en el Redis Stream `atalaya:uploads` (solo el id).
- **Worker** (`worker/atalaya_worker/`): revisión profunda (bomba zip contando bytes reales, entradas, zip slip, rango gigante, XXE con `defusedxml`, CSV), SHA-256 y tamaño contra lo guardado, `O_NOFOLLOW`, 20 s por archivo; un archivo que ya mató al worker no se reabre (`worker_timeout`).
- **S-1 (worker) cerrado:** rol de base `atalaya_worker` con permisos por columna (migración `20261118220000_uploads_worker_role`, sin LOGIN; el servicio `db-roles` le pone la contraseña) y usuario de Redis `worker` con ACL. Las dos contraseñas están en el `.env` del dueño (`WORKER_REDIS_PASSWORD`, `WORKER_DB_PASSWORD`).
- **Pantallas** `/archivos` (subir, estado con sondeo con retroceso, motivos en español, borrar) y `/admin/archivos` (metadatos; el admin no ve el nombre).
- **Pruebas:** API unitarias 205 · ataques e2e 98 (19 de subida + 11 de archivos hostiles) · Chrome 20 (6 nuevas) · worker 37 · `scripts/permisos-worker.sh` 25 comprobaciones (4 permisos, 21 rechazos) · smoke en orden. Fallas plantadas: sin el candado cae la prueba de carrera (11 en vez de 10); con un permiso de más sobre `users` cae el script de permisos.
- Laboratorio de 19 fichas (`docs/laboratorio/v0.8-subida.md`) y capítulo v0.8 de la guía.
- **Cambio fuera de la subida:** `/auth/me` usa `scaled(60)` (60 en producción, 300 en desarrollo y CI): la suite de Chrome agotaba el tope.

**Siguiente paso:** fusionar el PR de v0.7 (si no está ya) y abrir el PR de v0.8 hacia `main` (no hay `gh`: desde la web); mirar el CI, que **es la primera vez que corre** con las dos contraseñas del worker, el volumen de subidas compartido y el script de permisos. Luego etiqueta `v0.8` y `v0.9` (contrato primero).

**Bloqueos:** ninguno. Probar Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Pendientes nuevos de esta fase:** S-15 (un 429 o 5xx de `/me` manda a `/login`; debe redirigir solo ante 401) y el CSV en latin1, que hoy se rechaza (se revisa en v0.9).
**Ojo al probar:** las suites salen de una sola IP y el tope vive en la memoria de la API (S-6): entre dos corridas completas de e2e o de Chrome hay que reiniciar la API (`docker compose restart api`), y `smoke.sh` se corre una vez por minuto (él mismo agota el cupo de la IP). Todo `docker compose` necesita las dos variables del worker en `.env`.

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-18 | v0.8 construida, verificada, comiteada y subida (`fase/v0.8-subida`): subida segura, cola, worker con rol de base y usuario de Redis mínimos, pantallas de archivos, laboratorio de 19 fichas, capítulo v0.8 y `permisos-worker.sh`. Anotado S-15. Sin PR ni CI todavía. |
| 2026-11-18 | v0.7 construida, verificada y comiteada en su rama: bitácora de seguridad y auditoría, aviso de robo de sesión, recolector CSP y panel «Seguridad del sistema»; laboratorio de 12 fichas y capítulo v0.7. |
| 2026-11-17 | PR #6 fusionado con el CI 5/5; etiqueta `v0.6` en `abe5bcc`. v0.6 cerrada. |
| 2026-11-17 | v0.6 construida y verificada (sin comitear): login con Google (Code + PKCE + state + nonce) contra un servidor OAuth falso, id_token verificado a mano, vinculación por sub, 25 pruebas de ataque; laboratorio de 8 secciones y capítulo v0.6. |
| 2026-11-17 | PR #5 fusionado con el CI 5/5; etiqueta `v0.5` en `c35012f`. v0.5 cerrada. |
| 2026-11-17 | v0.5 construida y verificada (sin comitear): 2FA TOTP a mano, secreto cifrado, reto de un solo uso, códigos de recuperación, pantalla de seguridad; laboratorio de 11 ataques y capítulo v0.5. |
| 2026-11-17 | PR #4 fusionado con el CI 5/5; etiqueta `v0.4` en `e402831`. v0.4 cerrada. El enlace del lienzo de diseño se retiró de la rama antes del PR (reescrita con permiso del dueño). |
| 2026-11-17 | PR #3 fusionado con el CI 5/5; etiqueta `v0.3` en `073fe40`. v0.3 cerrada. |
| 2026-11-17 | v0.4 construida y verificada (sin comitear): interfaz «Observatorio» en todas las pantallas, 3 pruebas nuevas de interfaz. PR #3 (v0.3) con CI 5/5, pendiente de fusionar. |
| 2026-11-17 | v0.3 construida y verificada (sin comitear): jerarquía, admin de cuentas, invitaciones, inventario de rutas; laboratorio de 9 ataques y capítulo v0.3. |
| 2026-11-17 | PR #2 fusionado con el CI 5/5 (incluidas las suites e2e y de Chrome en GitHub); etiqueta `v0.2` en `24da658`. v0.2 cerrada. |
| 2026-11-17 | v0.2 construida y verificada (sin comitear): acceso completo, 3 suites de pruebas validadas con fallas plantadas, laboratorio de 10 ataques y capítulo v0.2 de la guía. |
| 2026-11-17 | PR #1 fusionado por el dueño con el CI 5/5; etiqueta `v0.1` en `a214a5a`. v0.1 cerrada. |
| 2026-11-17 | Repo público `DvloprBn/atalaya` creado por el dueño; subidas `main` (base vacía) y `fase/v0.1-esqueleto` tras escanear toda la historia. |
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
