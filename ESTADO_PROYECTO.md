# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.5` (2FA con TOTP), **construida y verificada** en la rama `fase/v0.5-2fa`. **Sin comitear** el trabajo de la fase (solo el commit de documentación del cierre de v0.4). `v0.1` a `v0.4` cerradas (etiqueta `v0.4` en `e402831`).

**Qué hay en v0.5 (verificado el 2026-11-17 contra el sistema vivo):**
- Migración `two_factor`: tablas `two_factors` y `recovery_codes` y el motivo `two_factor_changed`, con CHECKs probados uno por uno.
- TOTP escrito a mano: valida con los 6 vectores oficiales del RFC 6238 y coincide con `pyotp` con un secreto al azar.
- Secreto cifrado AES-256-GCM con el id del usuario como dato asociado (verificado en la base: `v1.<iv>.<etiqueta>.<texto>`); códigos de recuperación guardados solo como hash.
- Login en dos pasos con reto de un solo uso; activar/desactivar/regenerar con contraseña y código; activar cierra las demás sesiones.
- Interfaz: login en dos pasos y `/cuenta/seguridad` (QR, códigos de recuperación, administrar). Se corrigió un error real que mostraban las capturas: el campo del código arrastraba el correo del paso anterior.
- Pruebas: unitarias 117 · ataques e2e 26 (+11 de 2FA, incluidas 2 de carrera, y 1 de tope) · Chrome 7 · smoke 23 · worker 2. Simulación del CI con base nueva: todo en verde.
- Fallas plantadas: sin anti-repetición cayeron 3 pruebas; sin gasto del reto, 4 (y solo la carrera con códigos distintos distingue ese caso); tope del reto en 5000, 1; login que ignora el reto, la de Chrome.
- Nuevo `THROTTLE_SCALE` (5 en desarrollo y CI, 1 obligatorio en producción): las suites comparten una IP y ya rozaban el tope de entradas por minuto.

**Siguiente paso:**
1. El dueño revisa (guía capítulo v0.5 y `docs/laboratorio/v0.5-2fa.md`, y prueba el 2FA con su teléfono) y pide el commit.
2. Push, PR, CI, fusión y etiqueta `v0.5`.
3. Arranca `v0.6` (Google OAuth).

**Bloqueos:** ninguno.

## Historial

| Fecha | Qué |
|---|---|
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
