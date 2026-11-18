# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-18**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-18

**Fase actual:** `v0.9` **construida, verificada, comiteada y subida** en `fase/v0.9-analisis`. Las ramas están **apiladas** y ninguna ha pasado por GitHub: `main` (v0.6) ← `fase/v0.7-bitacora` ← `fase/v0.8-subida` ← `fase/v0.9-analisis` (9 commits por delante de `main`). Falta, en orden: fusionar v0.7, luego v0.8, luego v0.9 (cada PR con su CI y su etiqueta). Siguiente fase: `v0.10` (indicadores, Pareto, anomalías y pronóstico; dinero en `Decimal` y zona horaria).

**⚠ Una discrepancia sin resolver:** el dueño dijo (2026-11-18) haber fusionado v0.7, pero **GitHub no lo muestra**: `main` sigue en el merge de v0.6 (`abe5bcc`) y no existe la etiqueta `v0.7`. Hay que mirar si el PR quedó fusionado o solo aprobado, o si se fusionó en otra rama.

**Qué hay en v0.8 (subida segura):** `POST/GET /uploads` con el tipo por **firma de bytes**, sin `.xlsm` ni macros, 5 MB cortado mientras llega, tope de 10 por cuenta con candado, 404 en lo ajeno; cola en Redis Stream (solo el id); worker con **revisión profunda** (bomba zip, entradas, zip slip, rango gigante, XXE con `defusedxml`, SHA-256, `O_NOFOLLOW`) y rol de base y usuario de Redis **mínimos** (S-1 del worker cerrado); pantallas `/archivos` y `/admin/archivos` (solo metadatos).

**Qué hay en v0.9 (análisis de ventas):**
- **Dos pasos:** crear → el worker deja una **vista previa** (columnas, ejemplos, mapeo sugerido) → la persona confirma las columnas → el worker limpia y deja el informe. Tabla `analyses` con CHECK (estados y motivos cerrados, motivo sii falló, informe sii terminó, etapas, JSON objeto) y permisos por columna para el worker.
- **Limpieza** (`worker/atalaya_worker/cleaner.py`): reglas cerradas, nada se descarta sin contarse, una razón por fila y `rowsKept + rowsDropped == rowsRead`; fechas e importes decididos por **toda la columna**, avisando lo ambiguo; dinero en `Decimal`; duplicado = fila idéntica en todo lo mapeado.
- **Exportación** a dos CSV con **un solo sanitizador** anti inyección de fórmulas (`export.safe_cell`), solo sobre el texto; la API solo entrega.
- **Worker:** `openpyxl` en solo lectura y solo valores; latido en un hilo aparte; una etapa que ya mató al worker no se reabre (marca `SET NX` en Redis).
- **Pantallas:** `/analisis` y `/analisis/[id]` (formulario de mapeo completo, informe de calidad, descargas) y botón Analizar en «Mis archivos».
- **Pruebas (todas verdes el 2026-11-18):** API unitarias 236 · ataques e2e 109 (11 de análisis con el worker **real**) · Chrome 27 · worker 171 · `scripts/permisos-worker.sh` 38 · smoke en orden. Fallas plantadas detectadas: sin el candado de subidas (11 en vez de 10), un permiso de más al rol del worker (dos veces) y el sanitizador desactivado (6 celdas peligrosas).
- Laboratorios de 19 (v0.8) y 33 (v0.9) fichas, con lo que **no** está cubierto, y capítulos v0.8 y v0.9 de la guía.

**Siguiente paso:** resolver lo de v0.7 en GitHub; abrir los PR en cadena (no hay `gh`: desde la web) y mirar el CI, que **es la primera vez que corre** con: las dos contraseñas del worker (`WORKER_REDIS_PASSWORD`, `WORKER_DB_PASSWORD`), el volumen de subidas y el de resultados, `permisos-worker.sh`, `openpyxl` en la imagen del worker y `THROTTLE_SCALE` 10. Luego las etiquetas `v0.7`, `v0.8` y `v0.9`, y `v0.10` (contrato primero).

**Bloqueos:** ninguno técnico. Probar Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Pendientes nuevos de v0.8 y v0.9** (detalle en `PENDIENTES.md`): S-15 (un 429 o 5xx de `/me` manda a `/login`; debe redirigir solo ante 401); CSV en **latin1** (se rechaza; **no** se resolvió en v0.9, sin fase asignada); de un `.xlsx` solo se lee la primera hoja; la contraseña de Redis sigue en los argumentos (S-1, v1.0).
**Ojo al probar:** las suites salen de una sola IP y el tope vive en la memoria de la API (S-6): entre dos corridas completas de e2e o de Chrome hay que reiniciar la API (`docker compose restart api`), y `smoke.sh` se corre una vez por minuto (él mismo agota el cupo de la IP). Todo `docker compose` necesita en `.env` `WORKER_REDIS_PASSWORD` y `WORKER_DB_PASSWORD` (ya están en el `.env` del dueño).

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-18 | v0.9 construida, verificada, comiteada (3 commits) y subida (`fase/v0.9-analisis`): análisis de ventas en dos pasos, worker con `openpyxl`, limpieza con reglas cerradas y `Decimal`, exportación con sanitizador anti fórmulas, pantallas, laboratorio de 33 fichas y capítulo v0.9. Sin PR ni CI. Pendiente sin resolver: v0.7 no aparece fusionada en GitHub. |
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
