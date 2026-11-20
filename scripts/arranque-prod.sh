#!/bin/sh
# Arranque de los contenedores de PRODUCCIÓN (S-1): lee los secretos de /run/secrets, arma con ellos las variables que
# llevan contraseñas y lanza el comando que recibe (`exec "$@"`).
#
# Por qué existe: una contraseña puesta en `environment:` o en `command:` se ve con `docker inspect` y con `ps`.
# Aquí viven solo dentro del proceso que las usa. Cada servicio monta ÚNICAMENTE los secretos que le tocan
# (el compose los lista), así que este script arma solo lo que encuentra: el worker no ve la contraseña de la API.
set -eu

# Lee un secreto si existe y no está vacío; si no, devuelve fallo sin imprimir nada.
secret() { [ -s "/run/secrets/$1" ] && cat "/run/secrets/$1"; }

if pw=$(secret postgres_password); then
  export PGPASSWORD="$pw"
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${pw}@db:5432/${POSTGRES_DB}"
fi
if pw=$(secret worker_db_password); then
  export WORKER_DB_PASSWORD="$pw"
  # El worker no tiene la contraseña principal: su URL es la del rol mínimo.
  [ -s /run/secrets/postgres_password ] || export DATABASE_URL="postgresql://atalaya_worker:${pw}@db:5432/${POSTGRES_DB}"
fi
if pw=$(secret redis_password); then
  export REDIS_URL="redis://:${pw}@redis:6379"
fi
if pw=$(secret worker_redis_password); then
  export REDIS_URL="redis://worker:${pw}@redis:6379"
fi
if v=$(secret jwt_secret); then export JWT_SECRET="$v"; fi
if v=$(secret totp_encryption_key); then export TOTP_ENCRYPTION_KEY="$v"; fi
# S-9: solo durante una rotación (vacío el resto del tiempo).
if v=$(secret totp_encryption_key_old); then export TOTP_ENCRYPTION_KEYS_OLD="$v"; fi
if v=$(secret smtp_url); then export SMTP_URL="$v"; fi
# Opcional: vacío = el login con Google queda apagado.
if v=$(secret oauth_client_secret); then export OAUTH_CLIENT_SECRET="$v"; fi

exec "$@"
