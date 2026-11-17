# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.4` (interfaz «Observatorio»), **construida y verificada** en la rama `fase/v0.4-interfaz`. **Sin comitear.** `v0.1`, `v0.2` y `v0.3` cerradas (etiqueta `v0.3` en `073fe40`, PR #3, CI 5/5).

**Qué hay en v0.4 (verificado el 2026-11-17):**
- Dirección A «Observatorio» elegida por el dueño entre tres (en un lienzo de diseño privado del dueño). Interfaz entra como fase propia; las siguientes se recorren una posición (2FA = v0.5).
- Tokens en `globals.css`, fuentes con `next/font` (servidas por el sitio), componentes de marca, radar y marcos; las 9 pantallas rehechas. Revisadas con capturas en Chrome (escritorio y 390 px).
- Pruebas en Chrome real: 6/6 (las 3 anteriores + sin terceros, sin desborde en teléfono y movimiento reducido). La de terceros se validó con una falla plantada.

**Siguiente paso:**
1. Revisa la interfaz en http://localhost:3070 y pide el commit de v0.4 → PR, CI, fusión y etiqueta.
2. Arranca `v0.5` (2FA).

**Bloqueos:** ninguno.

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-17 | PR #3 fusionado con el CI 5/5; etiqueta `v0.3` en `073fe40`. v0.3 cerrada. |
| 2026-11-17 | v0.4 construida y verificada (sin comitear): interfaz «Observatorio» en todas las pantallas, 3 pruebas nuevas de interfaz. PR #3 (v0.3) con CI 5/5, pendiente de fusionar. |
| 2026-11-17 | v0.3 construida y verificada (sin comitear): jerarquía, admin de cuentas, invitaciones, inventario de rutas; laboratorio de 9 ataques y capítulo v0.3. |
| 2026-11-17 | PR #2 fusionado con el CI 5/5 (incluidas las suites e2e y de Chrome en GitHub); etiqueta `v0.2` en `24da658`. v0.2 cerrada. |
| 2026-11-17 | v0.2 construida y verificada (sin comitear): acceso completo, 3 suites de pruebas validadas con fallas plantadas, laboratorio de 10 ataques y capítulo v0.2 de la guía. |
| 2026-11-17 | PR #1 fusionado por el dueño con el CI 5/5; etiqueta `v0.1` en `a214a5a`. v0.1 cerrada. |
| 2026-11-17 | Repo público `DvloprBn/atalaya` creado por el dueño; subidas `main` (base vacía) y `fase/v0.1-esqueleto` tras escanear toda la historia. |
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
