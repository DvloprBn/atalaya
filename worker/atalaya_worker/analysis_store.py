"""Lo que el worker hace en la base para los ANÁLISIS. Mismo rol mínimo que en `store.py`:

    SELECT (id, upload_id, status, mapping, result_key) y UPDATE (status, preview, report, insights, fail_reason, updated_at)
    sobre `analyses`; más lo que ya lee de `uploads`. No ve de quién es un análisis.

Cada escritura va CONDICIONADA al estado en la propia sentencia: si la persona borró el análisis (o cambió algo)
mientras el worker trabajaba, el UPDATE toca 0 filas, devuelve False, y el worker sabe que debe tirar su resultado.
"""

from dataclasses import dataclass

from psycopg.types.json import Jsonb

from .store import Job, Store


@dataclass(frozen=True)
class AnalysisWork:
    id: str
    status: str  # previewing | queued | running
    mapping: dict | None
    result_key: str
    upload: Job
    upload_status: str


class AnalysisStore:
    def __init__(self, store: Store) -> None:
        self._store = store

    def _run(self, sql: str, params: tuple) -> int:
        return self._store.conn().execute(sql, params).rowcount

    def load(self, analysis_id: str) -> AnalysisWork | None:
        """El análisis con su archivo, solo si hay algo que hacer (y el archivo no se está borrando)."""
        row = (
            self._store.conn()
            .execute(
                "SELECT a.id, a.status, a.mapping, a.result_key, u.id, u.kind, u.sha256, u.size_bytes, u.storage_key, u.status "
                "FROM analyses a JOIN uploads u ON u.id = a.upload_id "
                "WHERE a.id = %s AND a.status IN ('previewing', 'queued', 'running') AND u.delete_requested_at IS NULL",
                (analysis_id,),
            )
            .fetchone()
        )
        if row is None:
            return None
        upload = Job(id=str(row[4]), kind=row[5], sha256=row[6], size_bytes=row[7], storage_key=row[8])
        return AnalysisWork(str(row[0]), row[1], row[2], row[3], upload, row[9])

    def claim_running(self, analysis_id: str) -> bool:
        """«queued» → «running», en una sola sentencia: dos workers (o un mensaje repetido) no toman el mismo trabajo."""
        return (
            self._run(
                "UPDATE analyses SET status = 'running', updated_at = now() WHERE id = %s AND status = 'queued'",
                (analysis_id,),
            )
            == 1
        )

    def save_preview(self, analysis_id: str, preview: dict) -> bool:
        return (
            self._run(
                "UPDATE analyses SET status = 'awaiting_mapping', preview = %s, updated_at = now() "
                "WHERE id = %s AND status = 'previewing'",
                (Jsonb(preview), analysis_id),
            )
            == 1
        )

    def save_report(self, analysis_id: str, report: dict, insights: dict) -> bool:
        """El informe de calidad y los indicadores se escriben JUNTOS: el análisis no está «terminado» sin los dos."""
        return (
            self._run(
                "UPDATE analyses SET status = 'done', report = %s, insights = %s, updated_at = now() "
                "WHERE id = %s AND status = 'running'",
                (Jsonb(report), Jsonb(insights), analysis_id),
            )
            == 1
        )

    def fail(self, analysis_id: str, reason: str) -> bool:
        return (
            self._run(
                "UPDATE analyses SET status = 'failed', fail_reason = %s, updated_at = now() "
                "WHERE id = %s AND status IN ('previewing', 'queued', 'running')",
                (reason, analysis_id),
            )
            == 1
        )
