# Estados anteriores de Atalaya

> Aquí bajan los «ESTADO VIVO» que se reescriben al cerrar cada sesión; el más reciente va **arriba**.

## Reescrito el 2026-11-19 (cierre con v0.10 subida, antes de su PR)

### (detalle de v0.10 y estado de entonces)

**Fase actual:** `v0.10` **construida, verificada, comiteada y subida** en `fase/v0.10-informe` (9 commits por delante de `main`, que ya contiene v0.7, v0.8 y v0.9 desde el PR #7 con el CI 5/5). Falta: abrir el PR de v0.10 (no hay `gh`: desde la web), mirar su CI y fusionarlo. Siguiente fase: `v0.11` (CFDI XML; el ataque de la fase es XXE con `defusedxml`).

**Etiquetas (2026-11-19, con el sí del dueño):** `v0.7` en `b860fca`, `v0.8` en `af38a62` y `v0.9` en `fc13f0a` (el último commit de cada fase, ya dentro de `main`); anotadas y subidas, con el formato de las anteriores.

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
