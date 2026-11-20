#!/bin/sh
# Crea la carpeta secrets/ de PRODUCCIÓN con un valor aleatorio propio por secreto (S-1, S-3).
#   ./scripts/crear-secretos.sh                      # crea los que falten
#   SMTP_URL='smtps://usuario:llave@host:465' ./scripts/crear-secretos.sh   # además guarda el correo
#   ./scripts/crear-secretos.sh --rotar-totp          # S-9: la llave actual del 2FA pasa a «vieja» y se crea una nueva
#   ./scripts/crear-secretos.sh --retirar-totp-vieja  # S-9: cuando --check del comando de rotación dé 0 (ver el laboratorio)
#
# NUNCA sobrescribe un secreto que ya existe: cambiar la llave del 2FA sin re-cifrar deja a todos sin entrar.
# La carpeta es privada (700) y está en .gitignore. Los archivos son legibles (444) porque Docker los monta tal cual
# y los contenedores corren con otro usuario; lo que los protege es la carpeta.
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p secrets
chmod 700 secrets

# --- S-9 · rotación de la llave del 2FA (procedimiento completo: docs/laboratorio/v1.0-rotacion-totp.md) ---
# Se reemplaza un archivo de solo lectura (444) creando uno nuevo y moviéndolo encima: la carpeta sí es escribible.
put() { printf '%s' "$2" > "secrets/.$1.tmp"; chmod 444 "secrets/.$1.tmp"; mv -f "secrets/.$1.tmp" "secrets/$1"; }
if [ "${1:-}" = "--rotar-totp" ]; then
  [ -s secrets/totp_encryption_key ] || { echo "No hay llave actual que rotar (secrets/totp_encryption_key)."; exit 1; }
  # Una rotación a la vez: si ya hay una vieja, las filas cifradas con ella quedarían sin llave.
  if [ -s secrets/totp_encryption_key_old ]; then
    echo "Ya hay una rotación en curso (secrets/totp_encryption_key_old no está vacío). Termínala y retírala primero."; exit 1
  fi
  put totp_encryption_key_old "$(cat secrets/totp_encryption_key)"
  put totp_encryption_key "$(openssl rand -hex 32 | tr -d '\n')"
  echo "Llave del 2FA rotada en secrets/. Siguiente: reinicia la API y corre el comando de rotación (ver el laboratorio)."
  echo "Respalda la llave NUEVA aparte de la base. Conserva la VIEJA mientras existan respaldos de la base hechos antes de hoy."
  exit 0
fi
if [ "${1:-}" = "--retirar-totp-vieja" ]; then
  put totp_encryption_key_old ""
  echo "Llave vieja retirada (archivo vacío). Reinicia la API. Si la necesitas para un respaldo antiguo, usa tu copia aparte."
  exit 0
fi

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
# S-9: la llave ANTERIOR del 2FA, solo durante una rotación. Vacía el resto del tiempo.
[ -e secrets/totp_encryption_key_old ] || { : > secrets/totp_encryption_key_old; chmod 444 secrets/totp_encryption_key_old; echo "  creado:    totp_encryption_key_old (vacío)"; }
# Opcional (S-12): el cliente OAuth de Google. Vacío = login con Google apagado.
[ -e secrets/oauth_client_secret ] || { : > secrets/oauth_client_secret; chmod 444 secrets/oauth_client_secret; echo "  creado:    oauth_client_secret (vacío)"; }

echo
echo "Respalda secrets/totp_encryption_key APARTE de la base: si se pierde, nadie con 2FA podrá entrar con su app (S-9)."
