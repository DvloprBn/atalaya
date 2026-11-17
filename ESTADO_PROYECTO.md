# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.2` **cerrada** (etiqueta `v0.2` = commit de fusión `24da658`, PR #2, CI 5/5). Siguiente: `v0.3` (6 roles con jerarquía y admin de usuarios) en la rama `fase/v0.3-roles-admin`.

**Qué hay hasta v0.2 (verificado el 2026-11-17):**
- Esqueleto (v0.1): Docker con dos redes, una sola puerta en `127.0.0.1:3070`, worker aislado, cabeceras en Caddy, contrato OpenAPI, pre-commit y CI.
- Acceso (v0.2): registro con verificación (el usuario nace al abrir el enlace), login, sesión con acceso JWT de 10 min y refresh de un solo uso rotado, robo de refresh detectado, logout y restablecimiento que cortan al instante, sin enumeración, topes por IP, cuenta y destinatario, CSRF, Argon2id y correos por bandeja de salida (Mailpit en desarrollo).
- Pruebas: unitarias 32 · ataques e2e 9 · Chrome real 1 · smoke 23 · worker 2. **CI 5/5 en GitHub** con las dos suites contra el sistema vivo (incluido Chrome en el servidor de GitHub).

**Siguiente paso:** v0.3. Primero el contrato (admin de usuarios y roles). Ver `PENDIENTES.md` → «Siguiente fase».

**Bloqueos:** ninguno.

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-17 | PR #2 fusionado con el CI 5/5 (incluidas las suites e2e y de Chrome en GitHub); etiqueta `v0.2` en `24da658`. v0.2 cerrada. |
| 2026-11-17 | v0.2 construida y verificada (sin comitear): acceso completo, 3 suites de pruebas validadas con fallas plantadas, laboratorio de 10 ataques y capítulo v0.2 de la guía. |
| 2026-11-17 | PR #1 fusionado por el dueño con el CI 5/5; etiqueta `v0.1` en `a214a5a`. v0.1 cerrada. |
| 2026-11-17 | Repo público `DvloprBn/atalaya` creado por el dueño; subidas `main` (base vacía) y `fase/v0.1-esqueleto` tras escanear toda la historia. |
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
