# Estados anteriores de Atalaya

> Aquí bajan los «ESTADO VIVO» que se reescriben al cerrar cada sesión; el más reciente va **arriba**.

## Reescrito el 2026-11-19 (v0.11 cerrada y S-15 resuelto, antes de empezar v0.12)


**Situación:** `main` ya contiene hasta **v0.11** (CFDI en XML, PR #9) y todas las etiquetas `v0.1`–`v0.11` están puestas (`v0.11` en `7ec13ff`). Siguiente fase según `PLAN_DESARROLLO.md` (el detalle de v0.10 vive en `docs/historial/ESTADOS_ANTERIORES.md`).
**Hecho en v0.11 (PR #9, etiqueta `v0.11`):**
- **Contrato** 0.11.0 (`kind` `xml` y `zip`, motivo `not_cfdi`, problemas `unsupported_document` y `unsupported_currency`) y **migración** `cfdi_kinds` (CHECK ampliados).
- **API:** la puerta de `.xml` y `.zip` por firma de bytes; rechaza `<!DOCTYPE`/`<!ENTITY` ya en la puerta (415).
- **Worker:** lector seguro de CFDI 3.3 y 4.0 (`defusedxml` con DTD prohibido, topes de tamaño, profundidad, elementos y atributos), lector de ZIP (cada entrada es un `.xml`; una mala rechaza todo el ZIP), **tabla virtual** (un renglón por concepto; ingreso suma, egreso resta; pago, traslado, nómina y otra moneda se descartan **contados**), revisión profunda y vista previa (sugiere `uuid` como pedido).
- **Defecto atrapado por la prueba:** la limpieza ignoraba en silencio los dos códigos nuevos (la lista cerrada vive en el contrato y en `cleaner.py`); corregido y con una prueba que obliga a que ambas coincidan.
- **Pantalla, generador, laboratorio y capítulo:** pantalla (selector `.csv,.xlsx,.xml,.zip`, `precheck`, aviso «no es una herramienta fiscal», prueba de Chrome nueva con un CFDI aceptado y un XXE frenado en la puerta), `scripts/generar_cfdi.py` (60 CFDI sintéticos con RFC de pruebas del SAT; determinista; el worker real da 11 799.00 al centavo y 4 descartes, como el manifiesto), laboratorio `docs/laboratorio/v0.11-cfdi.md` y capítulo v0.11. `smoke.sh` en orden; Chrome real **33** (antes 32 + 1).
**Pruebas (todas verdes el 2026-11-19):** worker **312** (con catálogo XXE, ZIP y tabla virtual) · API unitarias **283** · e2e **132** (11 archivos; 7 nuevas de CFDI contra el worker real) · `permisos-worker.sh` y `smoke.sh` en orden. **Fallas plantadas detectadas:** parser de XML permisivo (cae el catálogo XXE, y 2 e2e de XXE dentro de ZIP) y un código de problema quitado de la limpieza. Con S-15, Chrome real: **37**.
**S-15 cerrado (2026-11-19, PR #10 fusionado en `main`):** hook `useMe` en las 9 pantallas con sesión: solo un 401 manda a `/login`; lo demás muestra un aviso con «Reintentar». Chrome real **37** (4 nuevas en `sesion.spec.ts`). Una regresión propia atrapada por la suite (`/admin` con dependencias `[]`).
**Siguiente:** v0.12 (PDF: tiempo límite, PDF hostil, según `PLAN_DESARROLLO.md`). `DECISIONES.md` condensado (16 KB; el diseño de v0.2 a v0.10 está en `docs/historial/`).
**Bloqueos:** ninguno técnico. Probar Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Pendientes** (detalle en `PENDIENTES.md`): D-1 (CSV en latin1), D-2 (solo la primera hoja de un `.xlsx`), D-3 (Excel real y datos de un negocio real sin probar), P-1 (3 pruebas de `twofactor` que fallaron una vez y no reproducen) y los de seguridad S-1 a S-13 (S-1, la contraseña de Redis en los argumentos, es de v1.0).
**Ojo al probar:** (1) las suites salen de una sola IP y el tope vive en la memoria de la API (S-6): entre dos corridas completas, `docker compose restart api`; (2) **antes de una e2e, reconstruir las imágenes** (`docker compose up -d --build api worker`): la API vieja daba 415 a todo `.xml`; (3) `docker compose` necesita `WORKER_REDIS_PASSWORD` y `WORKER_DB_PASSWORD` en `.env` (ya están en el del dueño).

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
