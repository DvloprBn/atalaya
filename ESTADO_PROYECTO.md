# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.1` (esqueleto), construida y verificada en la rama `fase/v0.1-esqueleto`. **Sin commits todavía**: el dueño decide cuándo comitear.

**Qué funciona (verificado el 2026-11-17 contra el sistema vivo):**
- Pila Docker con 6 servicios (caddy, web, api, worker, db, redis) y dos redes (`edge` y `data` interna). La única puerta es `127.0.0.1:3070`.
- `GET /api/health` → 200 `{"status":"ok",…}`. Si se detiene el worker, a los 30 s responde **503** con `"worker":"down"` y se recupera solo.
- `scripts/smoke.sh`: 21/21 comprobaciones (funcionamiento, cabeceras, aislamiento, worker sin internet, sin root y de solo lectura, tope 429).
- Pruebas: api 8/8 (vitest) · worker 2/2 (pytest). typecheck, lint (`--deny-warnings`) y build limpios. `npm audit` y `pip-audit` en 0.
- Pre-commit probado: bloquea un patrón privado y un secreto falso (gitleaks por Docker, v8.30.1).
- CI escrito (`.github/workflows/ci.yml`) con acciones fijadas por SHA. **No ha corrido**: el repo de GitHub no existe todavía.

**Siguiente paso:**
1. El dueño revisa v0.1 (guía, capítulo v0.1) y pide el commit.
2. Se crea el repo público en GitHub. `gh` no está instalado: lo crea el dueño en la web o se instala `gh`.
3. Primer push, el CI corre, PR de `fase/v0.1-esqueleto` a `main`, etiqueta `v0.1`.
4. Arranca `v0.2` (registro y login).

**Bloqueos:** ninguno técnico. gitleaks no está instalado en la máquina: el hook usa su imagen Docker (ver `PENDIENTES.md`).

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
