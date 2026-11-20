#!/bin/sh
# Crea la carpeta secrets/ de PRODUCCIÓN con un valor aleatorio propio por secreto (S-1, S-3).
#   ./scripts/crear-secretos.sh                      # crea los que falten
#   SMTP_URL='smtps://usuario:llave@host:465' ./scripts/crear-secretos.sh   # además guarda el correo
#
# NUNCA sobrescribe un secreto que ya existe: cambiar la llave del 2FA sin re-cifrar deja a todos sin entrar.
# La carpeta es privada (700) y está en .gitignore. Los archivos son legibles (444) porque Docker los monta tal cual
# y los contenedores corren con otro usuario; lo que los protege es la carpeta.
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p secrets
chmod 700 secrets

make() { # nombre, bytes aleatorios
  if [ -e "secrets/$1" ]; then echo "  ya existe: $1 (no se toca)"; return; fi
  openssl rand -hex "$2" | tr -d '\n' > "secrets/$1"
  chmod 444 "secrets/$1"
  echo "  creado:    $1"
}

# Solo letras y números en hexadecimal: van dentro de URLs sin escapar.
make postgres_password 24
make redis_password 24
make worker_redis_password 24
make worker_db_password 24
make jwt_secret 32
make totp_encryption_key 32      # EXACTAMENTE 64 hexadecimales (32 bytes)

if [ -n "${SMTP_URL:-}" ] && [ ! -e secrets/smtp_url ]; then
  printf '%s' "$SMTP_URL" > secrets/smtp_url; chmod 444 secrets/smtp_url; echo "  creado:    smtp_url"
elif [ ! -e secrets/smtp_url ]; then
  echo "  FALTA:     smtp_url  → vuelve a correr con SMTP_URL='smtps://usuario:llave@host:465'"
fi
# Opcional (S-12): el cliente OAuth de Google. Vacío = login con Google apagado.
[ -e secrets/oauth_client_secret ] || { : > secrets/oauth_client_secret; chmod 444 secrets/oauth_client_secret; echo "  creado:    oauth_client_secret (vacío)"; }

echo
echo "Respalda secrets/totp_encryption_key APARTE de la base: si se pierde, nadie con 2FA podrá entrar con su app (S-9)."
