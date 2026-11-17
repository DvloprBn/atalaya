# Pendientes de Atalaya

> Abiertos. Lo cerrado se tacha y se mueve al Historial del ESTADO en el siguiente barrido. Cada pendiente indica **quién** y **cuándo** (fase).

## Seguridad

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| S-1 | La contraseña de Redis va en los argumentos de `redis-server` y en las URLs (visible con `docker inspect`). En producción: archivo ACL montado y secretos de Docker. Además, el worker tendrá su propio usuario de Redis, limitado a sus llaves y a la cola. | Claude | v0.7 (usuario del worker) · v1.0 (ACL y secretos) |
| S-2 | La CSP está en solo reporte y sin recolector: hoy nadie ve los reportes. | Claude | v0.6 (recolector) · v1.0 (bloqueo) |
| S-7 | Los intentos fallidos y los robos de refresh detectados todavía no quedan en una bitácora (`security_events`), y no se le avisa al dueño de la cuenta cuando se cierran sus sesiones por robo. | Claude | v0.6 |
| S-8 | La contraseña no se compara contra listas de contraseñas filtradas (NIST lo recomienda). Opción sin terceros: una lista local de las más comunes. | Claude | v0.3 o v0.6 (por decidir) |
| S-3 | En producción la API debe negarse a arrancar con valores de ejemplo de `.env.example`. | Claude | v1.0 |
| S-4 | Las imágenes base van por etiqueta (`postgres:18-alpine`…), no por digest. En producción, fijar por digest. | Claude | v1.0 |
| S-5 | En desarrollo, `api` y `web` no son de solo lectura (la recarga escribe `dist/` y `.next/`). Las imágenes de producción sí lo serán. | Claude | v1.0 |
| S-6 | El tope de peticiones vive en la memoria del proceso: basta con una instancia, pero con varias habría que pasarlo a Redis. Efecto práctico hoy: la suite e2e cabe una vez cada 15 min (o reiniciando la API). | Claude | v0.6 |

## Herramientas

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| H-1 | gitleaks no está instalado en la máquina (la instalación quedó bloqueada por los permisos del entorno de Claude). El pre-commit usa la imagen Docker `zricethezav/gitleaks:v8.30.1`. Opcional: instalarlo desde su release oficial verificando el checksum. | Dueño (opcional) | Cuando quiera |

## Siguiente fase (v0.3)
- Contrato primero: rutas de administración de usuarios (listar, crear, cambiar rol, desactivar) y de roles.
- Jerarquía estricta: nadie gestiona su mismo nivel ni uno mayor; `max_count` de director y super exigido en la base (índice parcial o candado).
- Personal creado desde el admin: nace verificado, con contraseña temporal enviada por correo y cambio obligatorio.
- Laboratorio v0.3: IDOR (API1), función por nivel (API5), escalada vertical.
