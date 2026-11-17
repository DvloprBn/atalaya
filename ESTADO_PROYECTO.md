# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.5` **cerrada** (etiqueta `v0.5` = commit de fusión `c35012f`, PR #5, CI 5/5). Siguiente: `v0.6` (entrar con Google) en la rama `fase/v0.6-google`.

**Qué hay hasta v0.5 (verificado el 2026-11-17):**
- Esqueleto (v0.1), acceso completo (v0.2), roles con jerarquía y admin de cuentas (v0.3), interfaz «Observatorio» (v0.4) y verificación en dos pasos con TOTP (v0.5).
- Pruebas: unitarias 117 · ataques e2e 26 · Chrome 7 · smoke 23 · worker 2. **CI 5/5 en GitHub.**
- La **parte A (acceso)** está completa salvo Google (v0.6) y la bitácora de seguridad (v0.7). La **parte B (análisis)** no existe todavía (v0.8 en adelante).

**Siguiente paso:** v0.6. Primero el contrato (inicio y retorno de Google). Ver `PENDIENTES.md` → «Siguiente fase». **Necesita del dueño** un cliente OAuth de Google (ID y secreto) para probar el flujo real; sin él, el flujo se prueba contra un servidor OAuth simulado local.

**Bloqueos:** ninguno para empezar; el cliente de Google decide hasta dónde se puede probar de punta a punta.

## Historial

| Fecha | Qué |
|---|---|
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
