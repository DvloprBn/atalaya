# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-18**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-19

**Fase actual:** `v0.10` **construida, verificada, comiteada y subida** en `fase/v0.10-informe` (9 commits por delante de `main`, que ya contiene v0.7, v0.8 y v0.9 desde el PR #7 con el CI 5/5). Falta: abrir el PR de v0.10 (no hay `gh`: desde la web), mirar su CI y fusionarlo. Siguiente fase: `v0.11` (CFDI XML; el ataque de la fase es XXE con `defusedxml`).

**Pendiente de gestión (necesita el sí del dueño, es público):** las etiquetas **`v0.7`, `v0.8` y `v0.9` no existen** en GitHub (solo `v0.1` a `v0.6`). Candidatos: `b860fca` (v0.7), `af38a62` (v0.8) y `fc13f0a` (v0.9), o el merge `287d6ab` para las tres, que se fusionaron de una vez.

**Qué hay en v0.10 (verificado el 2026-11-19):**
- **Contrato y esquema:** `kind` (ventas o gastos) y `insights` en `analyses` (migración `analysis_insights`, con CHECK: tipo cerrado, indicadores solo si terminó y solo un objeto JSON); `GET /profit` (ventas menos gastos).
- **Worker** (`worker/atalaya_worker/`): `tz.py` («hoy» en `America/Mexico_City`, también para v0.9), `quant.py`, `indicators.py`, `pareto.py`, `anomalies.py`, `forecast.py` e `insights.py`. Todo en `Decimal`; los indicadores se guardan **junto con el informe** en una sola sentencia. Anomalías contra el mismo día de la semana de las 5 semanas vecinas (MAD); pronóstico = promedio de las últimas 8 apariciones del día, con su **backtest**; si menos del 60 % de los días del rango tienen datos, dicen `insufficient_data`.
- **API:** `kind` al crear, `insights` en la vista, `GET /profit` con **centavos enteros** (`BigInt`, `money.ts`); ajeno e inexistente dan el mismo 404, también para un admin.
- **Pantallas:** informe de indicadores con gráficas en SVG a mano (una serie, tabla equivalente siempre, colores validados con el script de la guía), `/resultado`, selector de tipo y botones «Analizar ventas» y «Analizar gastos».
- **Tope general escalable** con `THROTTLE_SCALE` (en producción vale 60); `smoke.sh` comprueba que el tope existe y que no salta antes de 60.
- **El café ficticio** (`scripts/generar_cafe.py`, `datos-ejemplo/`): determinista, 730 días, ventas (limpias y sucias) y gastos. Su prueba de punta a punta **corrigió tres defectos** (baseline de anomalías, gastos espaciados, sinónimo de «categoría»); los totales coincidieron al centavo con lo sembrado.
- **Pruebas (todas verdes el 2026-11-19):** worker **234** · API unitarias **269** · ataques e2e **114** (corridos en la secuencia exacta del CI: smoke, permisos y toda la suite) · Chrome **32** · `scripts/permisos-worker.sh` **42**. Fallas plantadas detectadas: «hoy» en UTC, fuga de datos en el backtest, redondeo hacia abajo, baseline global de anomalías y un permiso de más al worker.
- Laboratorio de 32 fichas y capítulo v0.10 de la guía.

**Siguiente paso:** subir esta rama (hecho), abrir el PR de v0.10 y mirar el CI: **primera vez en GitHub** con el café, el tope general escalable, los indicadores del worker y `tzdata` en la imagen. Luego `v0.11` (contrato primero).

**Bloqueos:** ninguno técnico. Probar Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Pendientes** (detalle en `PENDIENTES.md`): S-15 (un 429 o 5xx de `/me` manda a `/login`); CSV en **latin1** (se rechaza); de un `.xlsx` solo se lee la primera hoja; los gastos no tienen pronóstico; los indicadores no se exportan a CSV (a propósito); Excel o LibreOffice reales y datos de un negocio real sin probar (se propuso Online Retail II de UCI, CC BY 4.0, que requiere descargar con el permiso del dueño); la contraseña de Redis sigue en los argumentos (S-1, v1.0). **Sin explicar:** una vez, 3 pruebas de `twofactor` fallaron en una corrida partida en dos y no reproduce (sospecha: acumulación del tope de verificaciones 2FA por corridas parciales).
**Ojo al probar:** las suites salen de una sola IP y el tope vive en la memoria de la API (S-6): entre dos corridas completas hay que reiniciar la API (`docker compose restart api`), y `smoke.sh` agota a propósito el cupo de `/api/health` (por eso las pruebas ya no lo usan). Todo `docker compose` necesita `WORKER_REDIS_PASSWORD` y `WORKER_DB_PASSWORD` en `.env` (ya están en el del dueño).

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-19 | v0.10 construida, verificada, comiteada (9 commits) y subida (`fase/v0.10-informe`): indicadores, Pareto, anomalías y pronóstico con su backtest, `/profit` en centavos enteros, «hoy» en la zona del negocio, gráficas con su tabla, el café ficticio (que corrigió tres defectos), laboratorio de 32 fichas y capítulo v0.10. `main` ya tenía v0.7, v0.8 y v0.9 (PR #7, CI 5/5); faltan sus etiquetas. Sin PR de v0.10 todavía. |
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
