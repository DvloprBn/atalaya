# Seguridad

Atalaya es un **proyecto de estudio**: se construye como si fuera un sistema real (OWASP Top 10 y OWASP API Security Top 10, pruebas por fase), pero no maneja datos reales.

## Reportar una vulnerabilidad

Usa **GitHub → Security → Report a vulnerability** (aviso privado) en este repositorio. No abras un issue público con detalles explotables. Incluye pasos para reproducirla y la versión (etiqueta `v0.x`).

## Qué cubre cada versión

Cada fase cierra con sus pruebas de seguridad: la tabla vive en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md) §5 y las comprobaciones automáticas en `scripts/smoke.sh` y en las pruebas de cada pieza.

## Datos

- El repositorio no contiene datos reales: las cuentas y los datos de ejemplo son sintéticos o de conjuntos abiertos con su licencia citada.
- En el demo, las cuentas de prueba y todo lo que suben se borran a las 24 horas. **No subas datos reales de personas.**
