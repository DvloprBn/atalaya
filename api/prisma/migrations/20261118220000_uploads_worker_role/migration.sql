-- Rol de base MÍNIMO para el worker (S-1, parte de la base). Escrita a mano: Prisma no modela roles.
--
-- El worker abre archivos subidos por desconocidos. Si un archivo hostil lograra ejecutar código dentro de él,
-- lo máximo que debe poder hacer en la base es cambiar el estado de los archivos. Por eso el rol NO ve cuentas,
-- correos, sesiones ni la bitácora, y sobre `uploads` solo tiene PERMISOS POR COLUMNA.
--
-- El rol nace SIN poder entrar (NOLOGIN) y sin contraseña: la contraseña es un secreto y no vive en una migración.
-- El servicio `db-roles` del compose le pone LOGIN y la contraseña (WORKER_DB_PASSWORD) en cada arranque.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atalaya_worker') THEN
    CREATE ROLE atalaya_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3;
  END IF;
END
$$;

-- Una consulta atascada no se queda para siempre ni retiene candados.
ALTER ROLE atalaya_worker SET statement_timeout = '15s';
ALTER ROLE atalaya_worker SET idle_in_transaction_session_timeout = '15s';

-- Se parte de CERO permisos (por si una migración futura o un default le diera algo sin querer).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM atalaya_worker;
GRANT USAGE ON SCHEMA public TO atalaya_worker;

-- Lo que LEE: lo justo para ubicar el archivo y comprobar que es el que la API guardó.
GRANT SELECT ("id", "kind", "sha256", "size_bytes", "storage_key", "status", "delete_requested_at") ON "uploads" TO atalaya_worker;
-- Lo que ESCRIBE: el resultado de la revisión. Nada más (ni dueño, ni nombre, ni hash).
GRANT UPDATE ("status", "reject_reason", "checked_at") ON "uploads" TO atalaya_worker;
