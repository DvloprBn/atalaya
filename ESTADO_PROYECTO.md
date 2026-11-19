# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-19** (v0.11 construida y verificada, sin comitear; falta PR, CI y etiqueta)

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-18

**Situación:** `main` ya contiene hasta **v0.10** (PR #8, CI 5/5) y todas las etiquetas `v0.1`–`v0.10` están puestas. Se trabaja **v0.11 (CFDI en XML)** en `fase/v0.11-cfdi`, **construida y verificada; falta comitear lo de hoy, PR, CI y etiqueta** (el detalle de v0.10 vive en `docs/historial/ESTADOS_ANTERIORES.md`).
**Hecho en v0.11 (verificado hoy):**
- **Contrato** 0.11.0 (`kind` `xml` y `zip`, motivo `not_cfdi`, problemas `unsupported_document` y `unsupported_currency`) y **migración** `cfdi_kinds` (CHECK ampliados).
- **API:** la puerta de `.xml` y `.zip` por firma de bytes; rechaza `<!DOCTYPE`/`<!ENTITY` ya en la puerta (415).
- **Worker:** lector seguro de CFDI 3.3 y 4.0 (`defusedxml` con DTD prohibido, topes de tamaño, profundidad, elementos y atributos), lector de ZIP (cada entrada es un `.xml`; una mala rechaza todo el ZIP), **tabla virtual** (un renglón por concepto; ingreso suma, egreso resta; pago, traslado, nómina y otra moneda se descartan **contados**), revisión profunda y vista previa (sugiere `uuid` como pedido).
- **Defecto atrapado por la prueba:** la limpieza ignoraba en silencio los dos códigos nuevos (la lista cerrada vive en el contrato y en `cleaner.py`); corregido y con una prueba que obliga a que ambas coincidan.
**Pruebas (todas verdes hoy):** worker **312** (con catálogo XXE, ZIP y tabla virtual) · API unitarias **283** · e2e **132** (11 archivos; 7 nuevas de CFDI contra el worker real) · `permisos-worker.sh` y `smoke.sh` en orden. **Fallas plantadas detectadas:** parser de XML permisivo (cae el catálogo XXE, y 2 e2e de XXE dentro de ZIP) y un código de problema quitado de la limpieza.
**Hecho hoy (2026-11-19, sin comitear):** pantalla (selector `.csv,.xlsx,.xml,.zip`, `precheck`, aviso «no es una herramienta fiscal», prueba de Chrome nueva con un CFDI aceptado y un XXE frenado en la puerta), `scripts/generar_cfdi.py` (60 CFDI sintéticos con RFC de pruebas del SAT; determinista; el worker real da 11 799.00 al centavo y 4 descartes, como el manifiesto), laboratorio `docs/laboratorio/v0.11-cfdi.md` y capítulo v0.11. `smoke.sh` en orden; Chrome real **33** (antes 32 + 1).
**Siguiente:** comitear por ruta (con permiso), correr las suites completas una vez más, PR, CI y etiqueta `v0.11` (con permiso del dueño).
**Bloqueos:** ninguno técnico. Probar Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Pendientes** (detalle en `PENDIENTES.md`): S-15 (un 429 o 5xx de `/me` manda a `/login`); CSV en latin1 (se rechaza); de un `.xlsx` solo se lee la primera hoja; Excel o LibreOffice reales y datos de un negocio real sin probar (Online Retail II de UCI, CC BY 4.0: descargarlo requiere el permiso del dueño); S-1 (contraseña de Redis en los argumentos, v1.0). **Sin explicar:** una vez, 3 pruebas de `twofactor` fallaron en una corrida partida en dos y no reproduce.
**Ojo al probar:** (1) las suites salen de una sola IP y el tope vive en la memoria de la API (S-6): entre dos corridas completas, `docker compose restart api`; (2) **antes de una e2e, reconstruir las imágenes** (`docker compose up -d --build api worker`): la API vieja daba 415 a todo `.xml`; (3) `docker compose` necesita `WORKER_REDIS_PASSWORD` y `WORKER_DB_PASSWORD` en `.env` (ya están en el del dueño).

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-18 | v0.11 a medias en `fase/v0.11-cfdi`: contrato, migración, puerta de la API y **worker de CFDI** (lector seguro con `defusedxml`, ZIP, tabla virtual, descartes contados) con 312 pruebas y 7 e2e nuevas contra el worker real (XXE dentro de ZIP incluido); defecto atrapado: la limpieza perdía en silencio los códigos nuevos. Falta pantalla, generador, laboratorio, capítulo, PR y etiqueta. `main` y las etiquetas `v0.7`–`v0.10` al día. |
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
