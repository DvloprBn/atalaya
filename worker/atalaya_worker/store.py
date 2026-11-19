"""Lo ÚNICO que el worker hace en la base. Se conecta con el rol `atalaya_worker`, que solo puede:

    SELECT (id, kind, sha256, size_bytes, storage_key, status, delete_requested_at) y
    UPDATE (status, reject_reason, checked_at)    ... sobre `uploads`, y NADA más.

No ve cuentas, correos, sesiones ni la bitácora. Si alguien lograra ejecutar código dentro del worker (un archivo
hostil contra un lector con falla), lo máximo que puede hacer en la base es cambiar el estado de los archivos.
(La migración `uploads_worker_role` define esos permisos; las pruebas en vivo comprueban que lo demás falla.)
"""

from dataclasses import dataclass

import psycopg


@dataclass(frozen=True)
class Job:
    id: str
    kind: str  # csv | xlsx | xml | zip | pdf
    sha256: str
    size_bytes: int
    storage_key: str


class Store:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._conn: psycopg.Connection | None = None

    def conn(self) -> psycopg.Connection:
        if self._conn is None or self._conn.closed:
            self._conn = psycopg.connect(self._dsn, autocommit=True, connect_timeout=5)
        return self._conn

    def reset(self) -> None:
        """Descarta la conexión (la siguiente consulta abre otra). Se usa tras un error de red."""
        if self._conn is not None:
            self._conn.close()
        self._conn = None

    def claim(self, upload_id: str) -> tuple[Job, bool] | None:
        """Pasa el archivo a «checking». Devuelve (trabajo, estaba_a_medias) o None si ya no hay nada que hacer.

        Es UNA sentencia atómica (el SELECT ... FOR UPDATE bloquea la fila): un mensaje repetido, o dos workers,
        no pueden tomar el mismo archivo. `estaba_a_medias` = ya estaba en «checking»: una revisión anterior
        murió sin terminar, y un archivo que ya mató al worker una vez NO se vuelve a abrir.
        """
        row = (
            self.conn()
            .execute(
                "WITH old AS (SELECT id, status FROM uploads WHERE id = %s AND delete_requested_at IS NULL "
                "AND status IN ('queued', 'checking') FOR UPDATE) "
                "UPDATE uploads u SET status = 'checking' FROM old WHERE u.id = old.id "
                "RETURNING u.id, u.kind, u.sha256, u.size_bytes, u.storage_key, old.status = 'checking'",
                (upload_id,),
            )
            .fetchone()
        )
        if row is None:
            return None
        job = Job(id=str(row[0]), kind=row[1], sha256=row[2], size_bytes=row[3], storage_key=row[4])
        return job, bool(row[5])

    def finish(self, upload_id: str, reason: str | None) -> None:
        """Deja el resultado. Solo si sigue en «checking»: nunca pisa un estado que otro ya cambió."""
        status = "accepted" if reason is None else "rejected"
        self.conn().execute(
            "UPDATE uploads SET status = %s, reject_reason = %s, checked_at = now() WHERE id = %s AND status = 'checking'",
            (status, reason, upload_id),
        )
