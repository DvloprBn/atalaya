#!/usr/bin/env bash
# v0.8 · El worker abre archivos de desconocidos: si un archivo hostil lograra ejecutar código dentro de él,
# esto es TODO lo que podría hacer. Con las credenciales REALES del worker (las de su .env) se comprueba que:
#   - lo que necesita, funciona; y
#   - todo lo demás en Postgres y en Redis es rechazado.
# Requiere la pila levantada y la migración `uploads_worker_role` aplicada (y `db-roles` ya corrido).
# Uso:  ./scripts/permisos-worker.sh        (lee WORKER_DB_PASSWORD y WORKER_REDIS_PASSWORD del entorno o de .env)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }
: "${WORKER_DB_PASSWORD:?falta WORKER_DB_PASSWORD}" "${WORKER_REDIS_PASSWORD:?falta WORKER_REDIS_PASSWORD}"

failures=0
pass() { printf '  ✔ %s\n' "$1"; }
fail() { printf '  ✘ %s\n' "$1"; failures=$((failures + 1)); }

# (El UPDATE de prueba usa valores constantes, como el del worker real: `reject_reason = reject_reason` LEE esa
# columna, y el worker no tiene permiso de leerla.)
# Postgres como atalaya_worker. La contraseña viaja por variable de entorno del contenedor, no por la línea de comandos.
sql() { docker compose exec -T -e PGPASSWORD="$WORKER_DB_PASSWORD" db psql -h localhost -U atalaya_worker -d "${POSTGRES_DB:-atalaya}" -tAc "$1" 2>&1; }
# La salida se guarda ANTES de buscar en ella: con `set -o pipefail`, `cmd | grep -q` falla si grep cierra la tubería
# temprano, y la comprobación daría el resultado contrario (así salió la primera versión de este script).
allowed() { local out; out=$(sql "$2" || true); if grep -q "ERROR" <<<"$out"; then fail "$1"; else pass "$1"; fi; }
denied() { local out; out=$(sql "$2" || true); if grep -q "ERROR" <<<"$out"; then pass "$1"; else fail "$1 (¡NO fue rechazado!)"; fi; }

# En un arranque en limpio, `db-roles` le pone la contraseña al rol unos segundos después de la migración: se espera.
for _ in $(seq 1 30); do sql "SELECT 1" | grep -q '^1$' && break; sleep 1; done || true

echo "Postgres: lo que el worker SÍ puede"
allowed "leer las columnas que necesita de uploads" "SELECT id, kind, sha256, size_bytes, storage_key, status, delete_requested_at FROM uploads LIMIT 1"
allowed "actualizar status, reject_reason y checked_at (sin filas, pero con permiso)" \
  "UPDATE uploads SET status = 'queued', reject_reason = NULL, checked_at = NULL WHERE false"
allowed "leer de analyses lo que necesita (estado, mapeo, llave de resultados)" \
  "SELECT id, upload_id, status, mapping, result_key FROM analyses LIMIT 1"
allowed "unir un análisis con su archivo (lo que lee el worker para trabajar)" \
  "SELECT u.storage_key, u.kind, u.sha256, u.size_bytes, a.mapping FROM analyses a JOIN uploads u ON u.id = a.upload_id LIMIT 1"
allowed "actualizar estado, vista previa, informe, motivo y fecha de un análisis" \
  "UPDATE analyses SET status = 'failed', preview = NULL, report = NULL, fail_reason = 'unreadable', updated_at = now() WHERE false"
allowed "escribir los indicadores (insights) de un análisis" \
  "UPDATE analyses SET insights = NULL WHERE false"

echo "Postgres: lo que NO puede"
denied "leer cuentas (users)"                "SELECT email FROM users LIMIT 1"
denied "leer sesiones"                       "SELECT * FROM sessions LIMIT 1"
denied "leer la bitácora de seguridad"       "SELECT * FROM security_events LIMIT 1"
denied "leer la auditoría"                   "SELECT * FROM audit_logs LIMIT 1"
denied "leer de quién es un archivo"         "SELECT owner_id FROM uploads LIMIT 1"
denied "leer el nombre original"             "SELECT display_name FROM uploads LIMIT 1"
denied "cambiar de quién es un archivo"      "UPDATE uploads SET owner_id = owner_id WHERE false"
denied "cambiar el hash de un archivo"       "UPDATE uploads SET sha256 = sha256 WHERE false"
denied "borrar archivos"                     "DELETE FROM uploads WHERE false"
denied "insertar archivos"                   "INSERT INTO uploads(id) VALUES (gen_random_uuid())"
denied "borrar una tabla"                    "DROP TABLE uploads"
denied "crear tablas"                        "CREATE TABLE x(a int)"
denied "crear roles"                         "CREATE ROLE intruso"
denied "leer de quién es un análisis"        "SELECT owner_id FROM analyses LIMIT 1"
denied "cambiar el mapeo que confirmó la persona" "UPDATE analyses SET mapping = NULL WHERE false"
denied "cambiar el nombre de los resultados" "UPDATE analyses SET result_key = result_key WHERE false"
denied "leer el tipo del análisis (kind)"    "SELECT kind FROM analyses LIMIT 1"
denied "cambiar el tipo del análisis"        "UPDATE analyses SET kind = 'sales' WHERE false"
denied "leer los indicadores ya escritos"    "SELECT insights FROM analyses LIMIT 1"
denied "borrar análisis"                     "DELETE FROM analyses WHERE false"
denied "insertar análisis"                   "INSERT INTO analyses(id) VALUES (gen_random_uuid())"

# Redis como `worker`. Un comando prohibido responde NOPERM.
rds() { docker compose exec -T redis redis-cli --user worker --pass "$WORKER_REDIS_PASSWORD" --no-auth-warning "$@" 2>&1; }
rallowed() { local out; out=$(rds "${@:2}" || true); if grep -qE "NOPERM|ERR" <<<"$out"; then fail "$1"; else pass "$1"; fi; }
rdenied() { local out; out=$(rds "${@:2}" || true); if grep -q "NOPERM" <<<"$out"; then pass "$1"; else fail "$1 (¡NO fue rechazado!)"; fi; }

echo "Redis: lo que el worker SÍ puede"
rallowed "escribir su latido"                set atalaya:worker:heartbeat prueba EX 30
rallowed "escribir su marca de etapa (SET NX)"     set atalaya:worker:started:prueba:preview 1 NX EX 10
rallowed "leer su cola de archivos con su grupo"   xreadgroup GROUP workers worker-1 COUNT 1 STREAMS atalaya:uploads 0
rallowed "crear su grupo en la cola de análisis"   xgroup create atalaya:analyses workers 0 MKSTREAM
rallowed "leer su cola de análisis con su grupo"   xreadgroup GROUP workers worker-1 COUNT 1 STREAMS atalaya:analyses 0

echo "Redis: lo que NO puede"
rdenied "leer llaves (GET)"                       get atalaya:worker:heartbeat
rdenied "listar llaves (KEYS)"                    keys '*'
rdenied "borrar todo (FLUSHALL)"                  flushall
rdenied "escribir en llaves de la API (topes de login)" set atalaya:login-fail:x 1
rdenied "AGREGAR trabajos a la cola (XADD)"       xadd atalaya:uploads '*' id x
rdenied "AGREGAR trabajos a la cola de análisis"  xadd atalaya:analyses '*' id x
rdenied "destruir el grupo de la cola"            xgroup destroy atalaya:uploads workers
rdenied "destruir el grupo de la cola de análisis" xgroup destroy atalaya:analyses workers
rdenied "leer la configuración (CONFIG GET)"      config get requirepass
rdenied "cambiar usuarios (ACL SETUSER)"          acl setuser worker '+@all'

if [ "$failures" -gt 0 ]; then
  echo "FALLÓ: $failures comprobación(es)"
  exit 1
fi
echo "Todo en orden: el worker solo puede lo que debe"
