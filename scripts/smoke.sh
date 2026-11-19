#!/usr/bin/env bash
# Prueba de humo de Atalaya contra la pila de Docker ya levantada.
# Comprueba que el sistema funciona Y que cada promesa de seguridad de v0.1 se cumple.
# Uso:  docker compose up -d --build && ./scripts/smoke.sh
set -euo pipefail

BASE="http://127.0.0.1:${ATALAYA_PORT:-3070}"
failures=0
pass() { printf '  ✔ %s\n' "$1"; }
fail() { printf '  ✘ %s\n' "$1"; failures=$((failures + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }

echo "Funciona"
check "/api/health responde 200 con todo en ok" \
  "curl -fsS $BASE/api/health | grep -q '{\"status\":\"ok\",\"checks\":{\"database\":\"ok\",\"redis\":\"ok\",\"worker\":\"ok\"}}'"
check "la página principal muestra el estado que le dio la API" \
  "curl -fsS $BASE/ | grep -q 'Estado del sistema'"
check "una ruta protegida sin sesión responde 401 (cerrado por defecto)" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/auth/me)\" = 401 ]"
check "una ruta de la API que no existe responde 404, no 500" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/no-existe)\" = 404 ]"

echo "Cabeceras de seguridad (las pone Caddy en todas las respuestas)"
for path in / /api/health; do
  headers=$(curl -sSI "$BASE$path")
  for h in 'x-content-type-options: nosniff' 'x-frame-options: DENY' 'referrer-policy:' \
           'permissions-policy:' 'content-security-policy-report-only:'; do
    check "$path lleva '$h'" "grep -qi \"^$h\" <<<\"\$headers\""
  done
  check "$path no anuncia el servidor (Server / X-Powered-By)" \
    "! grep -qiE '^(server|x-powered-by):' <<<\"\$headers\""
done

echo "Aislamiento"
check "el sitio solo escucha en 127.0.0.1 (no en la red local)" \
  "docker compose port caddy 80 | grep -q '^127.0.0.1:'"
check "el servidor OAuth falso (hace de Google) solo escucha en 127.0.0.1" \
  "docker compose port mock-idp 4000 | grep -q '^127.0.0.1:'"
check "el login con Google está configurado (/api/auth/providers)" \
  "curl -fsS $BASE/api/auth/providers | grep -q '\"google\":true'"
# Se lee la configuración real del contenedor (`docker compose port` imprime ":0" en vez de nada).
check "Mailpit (correos de desarrollo) solo escucha en 127.0.0.1" \
  "docker compose port mailpit 8025 | grep -q '^127.0.0.1:'"
check "la base no tiene puerto publicado" \
  "[ \"\$(docker inspect --format '{{json .HostConfig.PortBindings}}' \$(docker compose ps -q db))\" = '{}' ]"
check "el worker NO tiene salida a internet" \
  "! docker compose exec -T worker python -c 'import socket; socket.create_connection((\"1.1.1.1\", 443), 3)'"
check "el worker no puede escribir en su disco" \
  "! docker compose exec -T worker python -c 'open(\"/app/prueba\", \"w\")'"
check "el worker no corre como root" \
  "[ \"\$(docker compose exec -T worker id -u)\" != 0 ]"

echo "Tope de peticiones (OWASP API4) — va al final: deja la IP sin cupo un minuto"
# En desarrollo y CI el tope general se multiplica (THROTTLE_SCALE = 10 en el compose; en producción es 1). Se comprueba lo
# ESENCIAL: que EXISTE (llega un 429) y que NUNCA salta antes de las 60 peticiones por minuto de producción.
codes=$(for _ in $(seq 1 700); do curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/health"; done)
first_block=$(grep -n '^429$' <<<"$codes" | head -1 | cut -d: -f1 || true)
check "hay un tope de peticiones por minuto (llega un 429)" "[ -n \"$first_block\" ]"
check "y nunca salta antes de las 60 de producción (primer 429 en la ${first_block:-—})" "[ -n \"$first_block\" ] && [ \"$first_block\" -gt 60 ]"

if [ "$failures" -gt 0 ]; then
  echo "FALLÓ: $failures comprobación(es)"
  exit 1
fi
echo "Todo en orden"
