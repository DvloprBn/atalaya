# Pendientes de Atalaya

> Abiertos. Lo cerrado se tacha y se mueve al Historial del ESTADO en el siguiente barrido. Cada pendiente indica **quién** y **cuándo** (fase).

## Seguridad

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| S-1 | La contraseña de Redis va en los argumentos de `redis-server` y en las URLs (visible con `docker inspect`). En producción: archivo ACL montado y secretos de Docker. Además, el worker tendrá su propio usuario de Redis, limitado a sus llaves y a la cola. | Claude | v0.8 (usuario del worker) · v1.0 (ACL y secretos) |
| S-2 | La CSP está en solo reporte y sin recolector: hoy nadie ve los reportes. | Claude | v0.7 (recolector) · v1.0 (bloqueo) |
| S-7 | Los intentos fallidos y los robos de refresh detectados todavía no quedan en una bitácora (`security_events`), y no se le avisa al dueño de la cuenta cuando se cierran sus sesiones por robo. | Claude | v0.7 |
| S-9 | La llave `TOTP_ENCRYPTION_KEY` no se puede rotar: no hay forma de re-cifrar los secretos con una llave nueva. El formato guarda una versión (`v1.`) para poder añadirlo. Y si se pierde, los secretos son irrecuperables (quedan los códigos de recuperación): respaldarla **aparte** de la base. | Claude | v1.0 |
| S-10 | Quien pierde el teléfono **y** los códigos de recuperación no puede entrar, y ningún admin puede quitarle el 2FA. Un sistema real necesita un proceso de recuperación asistida con verificación de identidad. | Claude (diseño) · Dueño (proceso) | v1.0 (extensión documentada) |
| S-11 | TOTP no resiste el phishing en tiempo real (una página falsa que reenvía el código). WebAuthn/passkeys ata la respuesta al dominio y sí lo resiste. | Claude | Después de v1.0 (extensión) |
| S-8 | La contraseña no se compara contra listas de contraseñas filtradas (NIST lo recomienda). Opción sin terceros: una lista local de las más comunes. | Claude | v0.5 o v0.7 (por decidir) |
| S-3 | En producción la API debe negarse a arrancar con valores de ejemplo de `.env.example`. | Claude | v1.0 |
| S-4 | Las imágenes base van por etiqueta (`postgres:18-alpine`…), no por digest. En producción, fijar por digest. | Claude | v1.0 |
| S-5 | En desarrollo, `api` y `web` no son de solo lectura (la recarga escribe `dist/` y `.next/`). Las imágenes de producción sí lo serán. | Claude | v1.0 |
| S-6 | El tope de peticiones vive en la memoria del proceso: basta con una instancia, pero con varias habría que pasarlo a Redis. Efecto práctico hoy: la suite e2e cabe una vez cada 15 min (o reiniciando la API). | Claude | v0.7 |

## Herramientas

| Id | Qué | Quién | Cuándo |
|---|---|---|---|
| H-1 | gitleaks no está instalado en la máquina (la instalación quedó bloqueada por los permisos del entorno de Claude). El pre-commit usa la imagen Docker `zricethezav/gitleaks:v8.30.1`. Opcional: instalarlo desde su release oficial verificando el checksum. | Dueño (opcional) | Cuando quiera |

## Siguiente fase (v0.6)
- Contrato primero: inicio y retorno de Google (`/auth/google` y `/auth/google/callback`).
- Authorization Code + **PKCE** + `state` + `nonce`; del token se validan emisor, audiencia, vigencia y que el correo esté verificado.
- Solo se vincula a una cuenta **existente** si su correo ya está verificado (sin pre-secuestro); una cuenta de Google nueva nace con rol `usuario`.
- Una cuenta con 2FA que entra por Google **también** pasa por el segundo paso.
- Laboratorio v0.6: login CSRF (`state`), repetición de `nonce`, SSRF y consumo seguro de la API de Google (OWASP API7 y API10), vinculación a cuenta ajena.
