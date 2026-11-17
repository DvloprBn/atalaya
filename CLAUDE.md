# Atalaya — instrucciones del proyecto

> Proyecto de **estudio** de `dvlopmnt/`. El rol es el de la raíz (`../../ROL.md`): mentor honesto y directo, con los modos enseñanza, entrega, estrategia, mantenimiento y estatus. Aquí solo se agrega lo propio de Atalaya.

## Qué es y para qué
Acceso seguro (parte A) + analista de datos de un negocio (parte B). Es 100 % funcional y base para proyectos reales, pero su meta principal es que **el dueño entienda todo el código de principio a fin**. Plan: `PLAN_DESARROLLO.md`. Estado: `ESTADO_PROYECTO.md`. Decisiones: `DECISIONES.md`.

## Reglas de este proyecto
1. **Legibilidad primero.** Máximo ~200 líneas por archivo, comentarios del porqué, nada «por si acaso». Si una solución es más corta pero más difícil de leer, gana la legible.
2. **Contrato primero.** Toda ruta nueva se escribe antes en `contracts/openapi.yaml`; el front regenera sus tipos (`npm run contract:types`).
3. **Una fase a la vez.** Cada fase tiene rama `fase/v0.x-…`, PR revisado, etiqueta y su capítulo en `docs/GUIA_RECORRIDO.md`. No se adelanta trabajo de otra fase.
4. **Cada fase cierra con sus pruebas de seguridad** (tabla en `PLAN_DESARROLLO.md` §5) corridas contra el sistema vivo, no solo leídas en el código.
5. **Repo PÚBLICO.** Nada de datos personales del dueño ni de terceros: ni nombres, ni correos reales, ni rutas de su máquina. El pre-commit los bloquea con `.git/private-patterns` (local, fuera del repo). Las cuentas de prueba usan `@example.com`.
6. **Versiones fijadas** (`--save-exact`, `uv.lock`). Prisma siempre con versión explícita: `latest` apunta a un RC.
7. **Commits:** solo cuando el dueño lo pide, por ruta y nunca con `git add -A` (regla común de la raíz).

## Comandos
```bash
docker compose up -d --build && ./scripts/smoke.sh                 # sistema completo
cd api && npm run typecheck && npm run lint && npm test            # API
cd web && npm run contract:types && npm run typecheck && npm run build
cd worker && uv run ruff check . && uv run pytest -q               # worker
```
Prisma se corre **dentro** del contenedor (`docker compose exec api npx prisma …`). Ver la skill `/prisma` antes de cualquier migración.
