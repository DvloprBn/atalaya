# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.6` (entrar con Google), **construida y verificada** en la rama `fase/v0.6-google`. **Sin comitear** el trabajo de la fase (solo el commit de documentación del cierre de v0.5). `v0.1` a `v0.5` cerradas (etiqueta `v0.5` en `c35012f`).

**Qué hay en v0.6 (verificado el 2026-11-17 contra el sistema vivo):**
- Opción A elegida por el dueño: todo contra un **servidor OAuth falso** local (`mock-idp/`); el cliente real de Google se agrega después con seis variables `OAUTH_*`.
- Authorization Code + PKCE (vector oficial del RFC 7636) + `state` + `nonce`; el intento vive en Redis (10 min, un solo uso, solo hashes) atado al navegador por una cookie `__Host-` `SameSite=Lax`.
- `id_token` verificado a mano (93 líneas): RS256 fijo, `kid`, firma, emisor, audiencia, vigencia, `nonce` y `email_verified`.
- Vinculación por `sub` (tabla `oauth_identities`, con CHECKs y unicidades probados): vincula solo cuentas ya verificadas y avisa por correo; cuenta nueva = `usuario` sin contraseña. El 2FA no se salta. Una cuenta solo-Google recibe un `409` claro al intentar activar el 2FA.
- Consumo seguro del proveedor: sin redirecciones, 5 s, 64 KB, solo JSON; en producción solo HTTPS (verificado en `env.spec`).
- Pruebas: unitarias 172 · ataques e2e 53 (25 de Google, en dos archivos) · Chrome 11 · smoke 25 · worker 2. Simulación del CI con base nueva: todo en verde.
- Fallas plantadas: sin la cookie del intento cayeron 2 pruebas (login CSRF); sin el nonce, 2; sin `email_verified`, 2. **Dos fallas (algoritmo y «ya tiene otra cuenta de Google») no las vio la suite viva** porque otra capa también las rechaza (RS256 fijo; restricción única de la base): las unitarias sí cayeron (3 y 1). Se documentó como defensa en capas.

**Siguiente paso:**
1. El dueño revisa (guía capítulo v0.6 y `docs/laboratorio/v0.6-google.md`; prueba «Continuar con Google» en <http://localhost:3070/login>) y pide el commit.
2. Push, PR, CI, fusión y etiqueta `v0.6`.
3. Arranca `v0.7` (bitácoras de seguridad y panel).

**Bloqueos:** ninguno. Probar con Google **de verdad** necesita un cliente OAuth que crea el dueño (opcional, S-12).

## Historial

| Fecha | Qué |
|---|---|
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
