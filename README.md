# Atalaya

Proyecto de **estudio**, construido como si fuera un sistema real. Tiene dos partes:

1. **Acceso:** registro con verificación de correo, login con JWT, 6 roles con jerarquía, 2FA (TOTP) y Google OAuth.
2. **Análisis:** el analista de datos de un pequeño negocio. Subes un Excel/CSV de ventas o gastos, facturas CFDI o un PDF, y Atalaya limpia los datos y te dice qué está pasando.

La interfaz sigue la dirección «Observatorio»: turquesa para lo normal, ámbar para lo anómalo, con un radar de anomalías como pieza central. Pero lo más importante es que **todo el código se pueda leer y entender de principio a fin**. Por eso:

- ningún archivo pasa de ~200 líneas;
- los comentarios explican el **porqué**, no el qué;
- una guía única recorre el camino de una petición: [`docs/GUIA_RECORRIDO.md`](docs/GUIA_RECORRIDO.md).

## Arquitectura

```
Navegador ──► Caddy ──► web/   Next.js       (pantallas)
                 └─ /api ─► api/  NestJS  ── PostgreSQL
                                     │  └─── Redis
                                     ▼
                               worker/ Python (análisis; sin internet, sin root, solo lectura)
```

- El **contrato** de la API vive en [`contracts/openapi.yaml`](contracts/openapi.yaml) y manda sobre el código: el frontend genera sus tipos de ahí.
- Un gemelo con **Django** (después de v1.0) reemplazará solo `api/`. El frontend y el worker no cambiarán.

## Levantarlo

Requisitos: Docker con Compose. Opcionales: Node 24 y [uv](https://docs.astral.sh/uv/), para correr pruebas fuera de Docker.

```bash
cp .env.example .env                    # y cambia TODOS los valores (openssl rand -hex 24 / -hex 32; TOTP_ENCRYPTION_KEY = 64 hexadecimales)
git config core.hooksPath .githooks     # activa el pre-commit (secretos y .env)
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # crea las tablas
docker compose exec api npx prisma db seed          # cuentas de prueba: <rol>@example.com / TestOnly123!
./scripts/smoke.sh                      # comprueba que funciona y que es seguro
```

Abre <http://localhost:3070>. Los correos de desarrollo llegan a Mailpit: <http://localhost:3071>. Todo escucha solo en `127.0.0.1`.

## Pruebas

| Comando | Qué prueba |
|---|---|
| `cd api && npm test` | Unitarias de la API (sin Docker) |
| `cd api && npm run test:e2e` | Ataques contra el sistema vivo (ver `docs/laboratorio/`) |
| `cd web && npm run test:browser` | El recorrido completo en Chrome real |
| `cd worker && uv run pytest` | Worker |
| `./scripts/smoke.sh` | Funcionamiento, cabeceras y aislamiento del sistema vivo |

## Estructura

| Carpeta | Qué hay |
|---|---|
| `api/` | NestJS 12 + Prisma 7: quién puede hacer qué |
| `web/` | Next.js 16: solo pantallas |
| `worker/` | Python 3.14 + uv: el análisis de datos |
| `contracts/` | Los acuerdos entre piezas (OpenAPI y llaves de Redis) |
| `docs/` | La guía de recorrido y el laboratorio de ataques |
| `scripts/` | Prueba de humo contra el sistema vivo |

## Cómo estudiarlo con git

Cada fase vive en su rama (`fase/v0.x-…`), se fusiona con un PR revisado y queda marcada con una etiqueta. Para ver el proyecto tal como quedó en una fase:

```bash
git tag                   # v0.1, v0.2…
git checkout v0.1         # el proyecto exactamente como quedó en esa fase
git diff v0.1 v0.2        # todo lo que agregó la fase siguiente
```

El plan de fases está en [`PLAN_DESARROLLO.md`](PLAN_DESARROLLO.md).

## Licencia

[MIT](LICENSE). Seguridad: [`SECURITY.md`](SECURITY.md).
