# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-19** (cierre: v0.12 cerrada y etiquetada)

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-19

**Situación:** `main` tiene hasta **v0.12** (PDF) y todas las etiquetas `v0.1`–`v0.12` (`v0.12` en `16e307d`, PR #11 fusionado con el CI 5/5). `gh` está instalado y con sesión: PR, CI y registros (`gh run view --log-failed`) se manejan desde aquí (`gh pr edit` falla en la 2.46; usar `gh api`). Detalle de v0.12 en `docs/historial/ESTADOS_ANTERIORES.md` y su diseño en `DECISIONES.md`.
**Hecho en v0.12:** puerta de `.pdf` en la API, lector en un proceso hijo con topes de memoria, CPU y reloj, tabla lógica con `table_skipped`, pantalla, laboratorio, capítulo y generador; el CI destapó 4 cosas, corregidas antes de fusionar (`/api/health` en una e2e, `THROTTLE_SCALE` a 15, `overrides` de `effect`, diagnóstico de contenedores si algo falla).
**Pruebas (2026-11-19):** worker 352 · API 303 · e2e 150 · Chrome 38 · CI 5/5 · fallas sembradas detectadas (11/11 en el lector, 5/5 en la puerta).
**Siguiente:** **v1.0** según `PLAN_DESARROLLO.md` (demo de 24 h, compose de producción, CSP en bloqueo, ZAP; ahí caen S-1 a S-5 y S-8 a S-10).
**Bloqueos:** ninguno técnico. Google de verdad necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Pendientes** (en `PENDIENTES.md`): D-1 a D-4, H-2, P-1, P-2 y los de seguridad S-1 a S-13.
**Ojo al probar:** (1) entre dos corridas completas, `docker compose restart api` (tope en memoria, S-6), pero **el CI no reinicia** entre el smoke y las e2e: una e2e no consulta `/api/health`, y para reproducir el CI no se reinicia; `THROTTLE_SCALE` es 15. (2) Antes de una e2e, `docker compose up -d --build api worker`; tras cambiar dependencias, `--renew-anon-volumes` (el volumen de `node_modules` esconde la versión nueva). (3) `.env` con `WORKER_REDIS_PASSWORD` y `WORKER_DB_PASSWORD`. (4) Los PDF de prueba salen de `worker/tests/pdf_maker.py` y `api/test/e2e/pdf.ts`.

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-19 | Cierre de sesión: ESTADO VIVO acortado (el detalle de v0.12 bajó a `docs/historial/`), lección 265 en la Biblioteca (proceso hijo con topes, fallas sembradas, CI ≠ local, volumen anónimo, `overrides`, comprobar `gh`). |
| 2026-11-19 | v0.12 cerrada: PR #11 fusionado con el CI 5/5 y etiqueta `v0.12` en `16e307d`. Antes de fusionar, el CI destapó 4 cosas, corregidas en la rama: la e2e de la bomba contra `/api/health` (429 tras el smoke), el tope de subidas (`THROTTLE_SCALE` a 15), GHSA-7589-6fvf-x4pw en `effect` (`overrides`, H-2) y una API muda sin reproducir (P-2; el CI ahora imprime su estado). Corregida la nota vieja «no hay `gh`»: sí está instalado y con sesión. |
| 2026-11-19 | v0.12 construida y verificada en `fase/v0.12-pdf`: contrato 0.12.0 y migración `pdf_kinds`, puerta de `.pdf` en la API, lector de PDF en un proceso hijo con topes (memoria, CPU, reloj) y tabla lógica, pantalla, laboratorio, capítulo y generador. Worker 352, API 303, e2e 150, Chrome 38; fallas sembradas detectadas. Commits locales; falta subir, PR, CI, fusionar y etiqueta. |
| 2026-11-19 | Auditoría de las dependencias de producción del worker con `pip-audit` (7 paquetes de `uv.lock`: defusedxml, et-xmlfile, openpyxl, psycopg, psycopg-binary, redis, tzdata): sin vulnerabilidades conocidas. No cubre las de desarrollo ni la imagen base (S-4). Con esto, API, web y worker quedan auditados. |
| 2026-11-18 | v0.11 a medias en `fase/v0.11-cfdi`: contrato, migración, puerta de la API y **worker de CFDI** (lector seguro con `defusedxml`, ZIP, tabla virtual, descartes contados) con 312 pruebas y 7 e2e nuevas contra el worker real (XXE dentro de ZIP incluido); defecto atrapado: la limpieza perdía en silencio los códigos nuevos. Falta pantalla, generador, laboratorio, capítulo, PR y etiqueta. `main` y las etiquetas `v0.7`–`v0.10` al día. |
| 2026-11-19 | Barrido de documentación: `DECISIONES.md` de 64 KB a 16 KB (el diseño de v0.2 a v0.10 pasó íntegro a `docs/historial/DECISIONES_COMPLETAS_2026-11-19.md`, con punteros por línea verificados) y `PENDIENTES.md` ordenado en secciones (Datos D-1 a D-3, Pruebas P-1, Ideas, Cerrados; bloques de avance al historial). Seguridad: 0 vulnerabilidades de producción (API y web), 54 commits sin secretos, puertos solo en `127.0.0.1`; dependencias del worker sin auditar. |
| 2026-11-19 | S-15 resuelto: hook `useMe` en las 9 pantallas con sesión (solo un 401 manda a `/login`; lo demás, aviso con «Reintentar»), `sesion.spec.ts` con falla plantada; Chrome real 37/37; PR #10 fusionado en `main`. Una regresión propia (`/admin` con dependencias `[]`) la atrapó la suite. |
| 2026-11-19 | v0.11 cerrada: pantalla de CFDI, generador de CFDI sintéticos, laboratorio y capítulo; suites completas en verde (worker 312, API 283, e2e 132, Chrome real); PR #9 fusionado y etiqueta `v0.11` en `7ec13ff`. Siguiente en el plan: v0.12 (PDF). |
| 2026-11-19 | v0.10 construida, verificada, comiteada (9 commits) y subida (`fase/v0.10-informe`): indicadores, Pareto, anomalías y pronóstico con su backtest, `/profit` en centavos enteros, «hoy» en la zona del negocio, gráficas con su tabla, el café ficticio (que corrigió tres defectos), laboratorio de 32 fichas y capítulo v0.10. `main` ya tenía v0.7, v0.8 y v0.9 (PR #7, CI 5/5); se les pusieron sus etiquetas. Sin PR de v0.10 todavía. |
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
