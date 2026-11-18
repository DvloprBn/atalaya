"""La cola de análisis (Redis Stream) y el trato de cada mensaje.

El mensaje trae SOLO el id del archivo; todo lo demás se lee de la base (metadatos) y del volumen (bytes).
Grupo de consumidores: un mensaje entregado y no confirmado (XACK) queda «pendiente» y se vuelve a ver.
"""

import logging

import redis

from .analysis_jobs import handle_analysis
from .analysis_store import AnalysisStore
from .queues import ANALYSIS_STREAM, CONSUMER, GROUP, STREAMS, UPLOAD_STREAM
from .review import review
from .store import Store

STREAM = UPLOAD_STREAM  # (nombre histórico: la cola de archivos)

log = logging.getLogger("atalaya.worker.jobs")


def ensure_group(store: redis.Redis) -> None:
    for stream in STREAMS:
        try:
            store.xgroup_create(stream, GROUP, id="0", mkstream=True)
        except redis.ResponseError as error:
            if "BUSYGROUP" not in str(error):
                raise  # «ya existe» es lo normal desde el segundo arranque


def fetch(store: redis.Redis, block_ms: int) -> list[tuple[str, str, str]]:
    """(cola, id de mensaje, id del archivo o análisis). Primero lo pendiente de las dos colas; si no hay, espera lo nuevo."""
    for stream_id, wait in (("0", None), (">", block_ms)):
        reply = store.xreadgroup(GROUP, CONSUMER, dict.fromkeys(STREAMS, stream_id), count=1, block=wait)
        found = [
            (_text(name), _text(mid), _text(fields.get(b"id") or fields.get("id")))
            for name, entries in reply or []
            for mid, fields in entries
        ]
        if found:
            return found
    return []


def _text(value: bytes | str | None) -> str:
    return value.decode() if isinstance(value, bytes) else (value or "")


def handle(store: redis.Redis, db: Store, uploads_dir: str, message_id: str, upload_id: str) -> None:
    """Un mensaje. Cualquier excepción de la BASE sube (no se confirma y se reintenta); lo demás se cierra aquí."""
    claimed = db.claim(upload_id) if upload_id else None
    if claimed is None:
        log.info("mensaje sin trabajo (ya resuelto, borrado o inválido)")
    else:
        job, was_checking = claimed
        if was_checking:
            reason: str | None = "worker_timeout"  # ya lo intentó una vez y no terminó: no se repite
        else:
            try:
                reason = review(uploads_dir, job)
            except Exception as error:  # noqa: BLE001 - un fallo inesperado NO deja el archivo en «checking»
                log.error("fallo inesperado revisando un archivo: %s", type(error).__name__)
                reason = "corrupt"
        db.finish(job.id, reason)
        log.info("archivo revisado: %s", reason or "accepted")
    store.xack(STREAM, GROUP, message_id)


def dispatch(
    queue: redis.Redis, db: Store, uploads_dir: str, results_dir: str, stream: str, message_id: str, item_id: str
) -> None:
    """Cada cola, a su trabajo: la de archivos revisa archivos; la de análisis prepara y limpia análisis."""
    if stream == ANALYSIS_STREAM:
        handle_analysis(queue, AnalysisStore(db), uploads_dir, results_dir, message_id, item_id)
    else:
        handle(queue, db, uploads_dir, message_id, item_id)
