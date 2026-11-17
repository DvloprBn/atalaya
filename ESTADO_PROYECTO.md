# Estado del proyecto: Atalaya

> **Cómo leerlo:** el ESTADO VIVO es lo único vigente y se **reescribe** al cerrar cada sesión; el Historial solo suma filas. Pendientes en [`PENDIENTES.md`](PENDIENTES.md), decisiones en [`DECISIONES.md`](DECISIONES.md), plan en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

Última actualización: **2026-11-17**

---

## 1. Dónde estamos
### ESTADO VIVO (único vigente) — reescrito 2026-11-17

**Fase actual:** `v0.2` (registro, verificación, login, sesiones, logout y restablecer contraseña), **construida y verificada** en la rama `fase/v0.2-registro-login`. **Sin comitear** el trabajo de la fase (solo el commit de documentación del cierre de v0.1). `v0.1` cerrada (etiqueta en `a214a5a`).

**Qué funciona (verificado el 2026-11-17 contra el sistema vivo):**
- Migración `auth`: 6 tablas, 6 roles fijos y CHECKs; cada CHECK probado bloqueando (y 2 filas válidas aceptadas). Uno estaba mal (`NULL IN` deja pasar) y se corrigió antes de publicar la migración.
- API: 8 rutas en `/api/auth`, correos por bandeja de salida a Mailpit; la bandeja queda con 0 bytes de cuerpo y 0 tokens tras enviar.
- Pruebas: unitarias api 32/32 · ataques e2e 9/9 · Chrome real 1/1 · smoke 23/23 · worker 2/2. Las suites e2e y de navegador se validaron con **fallas plantadas** (3/9 y 1/1 cayeron donde debían).
- Login: tiempos iguales para cuenta existente e inexistente (≈30 ms ambas).
- Simulación completa del trabajo e2e del CI en local con base nueva: todo en verde.

**Siguiente paso:**
1. El dueño revisa (guía capítulo v0.2 y `docs/laboratorio/v0.2-acceso.md`) y pide el commit.
2. Push de la rama, PR, CI y fusión; etiqueta `v0.2`.
3. Arranca `v0.3` (6 roles con jerarquía y admin de usuarios).

**Bloqueos:** ninguno. La suite e2e solo cabe una vez cada 15 min por los topes (ver `PENDIENTES.md` S-6).

## Historial

| Fecha | Qué |
|---|---|
| 2026-11-17 | v0.2 construida y verificada (sin comitear): acceso completo, 3 suites de pruebas validadas con fallas plantadas, laboratorio de 10 ataques y capítulo v0.2 de la guía. |
| 2026-11-17 | PR #1 fusionado por el dueño con el CI 5/5; etiqueta `v0.1` en `a214a5a`. v0.1 cerrada. |
| 2026-11-17 | Repo público `DvloprBn/atalaya` creado por el dueño; subidas `main` (base vacía) y `fase/v0.1-esqueleto` tras escanear toda la historia. |
| 2026-11-17 | Proyecto creado (estrategia aprobada: partes A y B, 12 fases). v0.1 construida y verificada: pila Docker con redes separadas, API Nest 12 cerrada por defecto con `/api/health`, web Next 16 con tipos del contrato, worker Python con latido, Caddy con cabeceras, smoke 21/21, pre-commit y CI. |
