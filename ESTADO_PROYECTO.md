# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-18**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-18

**Fase actual:** `v0.7` **construida, verificada y comiteada** en la rama `fase/v0.7-bitacora` (falta el PR, el CI y la etiqueta). Siguiente: `v0.8` (subida segura, cola y worker con rol mínimo).

**Qué hay en v0.7 (verificado el 2026-11-18):**
- `security_events` y `audit_logs` (migración `20261118120000_security_log`), IP como HMAC, tipos cerrados con CHECK, retención de 90 días.
- Eventos: login fallido/bloqueado, 2FA fallido, refresh reusado (con **correo al dueño**), rechazo de Google, tope superado, violación de CSP. Auditoría dentro de la transacción de cada acción de admin y de 2FA.
- Recolector `POST /api/csp-report` (público, topado, dedupe, solo directiva + host) y `report-uri` en la CSP (sigue en solo reporte).
- Panel **Seguridad del sistema** (`/admin/seguridad`): radar de 14 días con tabla equivalente, bitácora filtrable y auditoría; la jerarquía oculta las cuentas de nivel igual o superior.
- Pruebas: unitarias 185 · ataques e2e 68 · Chrome 14 · smoke 25 (el CI de GitHub aún no corrió esta fase). Falla plantada en la regla de visibilidad: caen las 2 pruebas esperadas.
- Cerrados S-7 y S-14; S-2 con recolector (bloqueo en v1.0); S-6 y S-8 pasan a v1.0.

**Siguiente paso:** abrir el PR de v0.7 (no hay `gh`: desde la web de GitHub) y esperar el CI. Luego v0.8 (contrato primero). Ver `PENDIENTES.md` → «Siguiente fase».

**Bloqueos:** ninguno. Probar Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).
**Ojo al probar:** las suites salen de una sola IP y el tope vive en la memoria de la API (S-6): entre dos corridas completas de e2e hay que reiniciar la API (`docker compose restart api`), y `smoke.sh` se corre una vez por minuto.

## Historial

| Fecha | Qué |
|---|---|
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
