# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.1` **cerrada** (etiqueta `v0.1` = commit de fusión `a214a5a`, PR #1). Siguiente: `v0.2` (registro, verificación de correo, login, refresh y logout), en la rama `fase/v0.2-registro-login`.

**Qué hay en v0.1 (verificado el 2026-11-17):**
- Pila Docker con 6 servicios y dos redes (`edge` y `data` interna); única puerta en `127.0.0.1:3070`.
- `GET /api/health`: 200 si todo responde; 503 con la pieza caída (probado deteniendo el worker).
- `scripts/smoke.sh` 21/21 en local y en el CI; api 8/8; worker 2/2; `npm audit` y `pip-audit` en 0.
- **CI 5/5 en GitHub** (PR #1): secretos, API, web, worker y sistema completo.
- Repo público `DvloprBn/atalaya`; historia escaneada antes de la primera subida (gitleaks, patrones privados, correos, binarios: todo en 0).

**Siguiente paso:** v0.2. Primero el contrato (rutas de registro, verificación, login, refresh, logout), Mailpit en compose y la primera migración (`roles`, `users`). Ver `PENDIENTES.md` → «Siguiente fase».

**Bloqueos:** ninguno. gitleaks local sigue opcional (H-1).

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-17 | PR #1 fusionado por el dueño con el CI 5/5; etiqueta `v0.1` en `a214a5a`. v0.1 cerrada. |
| 2026-11-17 | Repo público `DvloprBn/atalaya` creado por el dueño; subidas `main` (base vacía) y `fase/v0.1-esqueleto` tras escanear toda la historia. |
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
