# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.3` (6 roles con jerarquía, panel `/admin`, invitaciones), **construida y verificada** en la rama `fase/v0.3-roles-admin`. **Sin comitear** el trabajo de la fase. `v0.1` y `v0.2` cerradas (etiquetas en `a214a5a` y `24da658`).

**Qué funciona (verificado el 2026-11-17 contra el sistema vivo):**
- Migración `admin`: propósito `invite` y motivo `account_disabled`, con CHECKs probados (escritos sin nombrar el valor nuevo del enum: Postgres no deja usarlo en la misma transacción).
- API: 7 rutas `/api/admin/*` (nivel admin o más) + `accept-invite`. Jerarquía estricta (404 para lo de arriba), candado de fila en cada cambio, tope de 1 director y 1 super con candado de rol, desactivar revoca sesiones.
- Pruebas: unitarias 82 (incluye las 36 combinaciones de la jerarquía y el inventario de rutas contra el contrato) · ataques e2e 16 (9 de acceso + 7 de admin, incluida la carrera por el puesto de director) · Chrome real 3 · smoke 23 · worker 2.
- Fallas plantadas: la regla `<` → `<=` hizo caer 10 unitarias y la de escalada e2e; reveló que la regla estaba duplicada y se unificó. El inventario de rutas falló al escribirse (faltaban las 8 rutas en el contrato) y pasó al completarlo.
- Simulación del CI con base nueva: todo en verde.

**Siguiente paso:**
1. El dueño revisa (guía capítulo v0.3 y `docs/laboratorio/v0.3-roles.md`) y pide el commit.
2. Push, PR, CI, fusión y etiqueta `v0.3`.
3. Arranca `v0.4` (2FA con TOTP y códigos de recuperación).

**Bloqueos:** ninguno.

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-17 | v0.3 construida y verificada (sin comitear): jerarquía, admin de cuentas, invitaciones, inventario de rutas; laboratorio de 9 ataques y capítulo v0.3. |
| 2026-11-17 | PR #2 fusionado con el CI 5/5 (incluidas las suites e2e y de Chrome en GitHub); etiqueta `v0.2` en `24da658`. v0.2 cerrada. |
| 2026-11-17 | v0.2 construida y verificada (sin comitear): acceso completo, 3 suites de pruebas validadas con fallas plantadas, laboratorio de 10 ataques y capítulo v0.2 de la guía. |
| 2026-11-17 | PR #1 fusionado por el dueño con el CI 5/5; etiqueta `v0.1` en `a214a5a`. v0.1 cerrada. |
| 2026-11-17 | Repo público `DvloprBn/atalaya` creado por el dueño; subidas `main` (base vacía) y `fase/v0.1-esqueleto` tras escanear toda la historia. |
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
