# Plan de desarrollo: Atalaya

> Estrategia. Cambia poco; lo diario va en `ESTADO_PROYECTO.md` y las decisiones en `DECISIONES.md`. Aprobado el 2026-11-17.

## 1. Qué es

Proyecto de **estudio**, 100 % funcional, que sirve de base para proyectos reales:

- **Parte A, Acceso:** registro con verificación de correo, login JWT, 6 roles con jerarquía, 2FA TOTP, Google OAuth y bitácoras. Es reutilizable tal cual.
- **Parte B, Análisis:** el analista de datos de un pequeño negocio. Lee ventas y gastos (Excel/CSV), facturas CFDI (XML) y PDF; limpia los datos, da un informe de calidad, indicadores y un pronóstico.

La parte A se termina, se etiqueta y se estudia antes de tocar la B. Si la B crece demasiado, se separa en su propio repo sin rehacer nada.

## 2. Arquitectura

```
Navegador ──► Caddy ──► web/  Next.js 16
                 └─ /api ─► api/ NestJS 12 + Prisma 7 ── PostgreSQL 18
                                    │  └──────────────── Redis 8 (topes, tokens de un uso, cola)
                                    ▼  cola (Redis Streams)
                              worker/ Python 3.14 (Polars + DuckDB; sin internet, sin root, solo lectura)
```

- **Contrato primero:** `contracts/openapi.yaml` se escribe antes que el código. El frontend genera sus tipos de ahí y el gemelo Django lo cumplirá tal cual.
- **Gemelo (después de v1.0):** Django + DRF reemplaza solo `api/`. Usa Argon2id, así que lee las mismas contraseñas. El front sigue siendo Next.
- **El admin administra cuentas, no lee datos:** de los archivos de un cliente solo ve metadatos (dueño, tamaño, estado, fecha).

## 3. Tecnologías y versiones (verificadas el 2026-11-17)

| Pieza | Versión | Nota |
|---|---|---|
| NestJS | 12.5.1 | ESM, igual que dvlopr-bn |
| Prisma | **7.10.1** fijada | La etiqueta `latest` de npm apunta a 8.0.0-rc: nunca instalar sin versión |
| TypeScript | 6.0.3 (api) · 5.9.3 (web) | El CLI de Nest exige `~6.0.2`; openapi-typescript 7.13 exige TS 5 |
| Next.js / React | 16.4.6 / 19.3.1 | — |
| Python / uv | 3.14 / 0.13.9 | — |
| Análisis (v0.8+) | Polars, DuckDB, openpyxl, defusedxml, pdfplumber | Más un notebook con pandas para comparar |
| Pruebas | vitest 4.1 · pytest · Playwright (v0.2+) · `scripts/smoke.sh` | — |
| Escaneo | gitleaks · `npm audit` · `pip-audit` · OWASP ZAP (v1.0) · Trivy (v1.0) | — |

## 4. Reglas de legibilidad (son requisitos, no gustos)

1. Máximo ~200 líneas por archivo. Si crece, se parte por responsabilidad.
2. Los comentarios explican el **porqué**. El qué lo dice el código.
3. Un módulo pequeño puede vivir en el mismo archivo que su servicio o controlador (`@Module` al final); se separa cuando crece.
4. Las pruebas viven junto al código (`*.spec.ts`, `tests/`).
5. Una sola guía: `docs/GUIA_RECORRIDO.md`, con un capítulo por fase.
6. Nada de código «por si acaso»: cada archivo existe porque una fase lo usa.

## 5. Fases

Cada fase tiene su rama `fase/v0.x-…`, un PR revisado y una etiqueta al fusionar.

| Etiqueta | Entrega | Pruebas de seguridad que la cierran |
|---|---|---|
| `v0.1` | Docker, CI, contrato, pre-commit, «hola» de punta a punta | Secretos, solo `127.0.0.1`, cabeceras, worker aislado, cerrado por defecto, topes |
| `v0.2` | Registro, verificación de correo (Mailpit local; Resend del portafolio en el demo), login, refresh, logout y restablecer la contraseña | API2, API3, enumeración (texto y tiempo), pre-secuestro, reuso del refresh, logout y restablecimiento que cortan al instante, CSRF |
| `v0.3` | 6 roles con jerarquía, admin de cuentas, invitaciones por correo, inventario de rutas contra el contrato | API1 (IDOR, 404), API3, API5, escalada vertical, carrera por el puesto único, sesiones que no reviven |
| `v0.4` | Interfaz «Observatorio»: tokens de diseño, fuentes servidas por el propio sitio, componentes (marca, radar, tarjetas) y todas las pantallas actuales | Sin recursos de terceros en tiempo de ejecución, contraste AA, movimiento reducido, mismas pruebas de navegador en verde |
| `v0.5` | 2FA TOTP (escrito a mano, validado con los vectores del RFC 6238), códigos de recuperación, login en dos pasos con reto de un solo uso, activar/desactivar/regenerar con contraseña y código | Fuerza bruta del código, reuso (replay), reto reusado, carreras, secreto cifrado, sesión robada |
| `v0.6` | Google OAuth (Code + PKCE + `state` + `nonce`) con un servidor OAuth falso local para probar todo, vinculación de cuentas por `sub`, el 2FA no se salta | Login CSRF, id_token falsificado (9 variantes), apoderarse de una cuenta por vinculación, API7 y API10 |
| `v0.7` | `security_events`, `audit_logs`, panel de seguridad, recolector de CSP | API4 (ráfagas por ruta) |
| `v0.8` | Subida segura, cola y worker con rol de base mínimo y usuario de Redis propio | Bomba zip, firma falsa, rango gigante, `.xlsm` |
| `v0.9` | Lector de ventas, mapeo de columnas, limpieza e informe de calidad | Inyección de fórmulas al exportar |
| `v0.10` | Informe de ventas y gastos: indicadores, Pareto, anomalías, pronóstico | Dinero en `Decimal`, zona horaria |
| `v0.11` | CFDI XML | XXE (defusedxml) |
| `v0.12` | PDF | Tiempo límite, PDF hostil |
| `v1.0` | Demo de 24 h, datos de ejemplo, compose de producción, CSP en bloqueo, escaneo ZAP completo | OWASP Top 10 + API Top 10 completo |

## 6. Demo (v1.0)

- **Cuenta de prueba:** registro con verificación de correo; prueba toda la funcionalidad de usuario.
- **Aviso fijo con cuenta regresiva:** «Esta cuenta y todo lo que subas se borran el *<fecha y hora>*. Usa solo datos de prueba». Al subir, una casilla obligatoria: «Confirmo que no contiene datos reales de personas».
- **Límites:** 10 archivos de máximo 5 MB, 50 mil filas por archivo, 20 análisis al día y un tope global de cuentas de prueba activas.
- **Borrado:** cada 15 minutos y al arrancar, en cascada (cuenta, archivos, resultados).
- **Admin y roles:** se muestran con las invitaciones de dvlopr-bn (credenciales cifradas y con vigencia), nunca a un visitante anónimo.
- **Datos de ejemplo:**
  - un café ficticio con 3 sucursales y 2 años de ventas y gastos, generado con semilla fija y con anomalías sembradas;
  - «Online Retail II» (UCI, CC BY 4.0; se verifica la licencia al descargarlo);
  - CFDI sintéticos con el RFC de pruebas del SAT.
- **Fuera de alcance, a propósito:** organizaciones (varias personas compartiendo datos de un negocio). Queda como extensión documentada.

## 7. Puertos

Solo `127.0.0.1:3070` (Caddy). Nada más se publica.
