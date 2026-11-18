"""La cola de análisis (Redis Stream) y el trato de cada mensaje.

El mensaje trae SOLO el id del archivo; todo lo demás se lee de la base (metadatos) y del volumen (bytes).
Grupo de consumidores: un mensaje entregado y no confirmado (XACK) queda «pendiente» y se vuelve a ver.
"""

import logging

import redis

from .review import review
from .store import Store

STREAM = "atalaya:uploads"  # el mismo nombre que api/src/uploads/uploads.service.ts
GROUP = "workers"
CONSUMER = "worker-1"  # estable a propósito: sus pendientes se recuperan al reiniciar

log = logging.getLogger("atalaya.worker.jobs")


def ensure_group(store: redis.Redis) -> None:
    try:
        store.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except redis.ResponseError as error:
        if "BUSYGROUP" not in str(error):
            raise  # «ya existe» es lo normal desde el segundo arranque


def fetch(store: redis.Redis, block_ms: int) -> list[tuple[str, str]]:
    """(id de mensaje, id de archivo). Primero lo que quedó pendiente; si no hay, espera lo nuevo."""
    for stream_id, wait in (("0", None), (">", block_ms)):
        reply = store.xreadgroup(GROUP, CONSUMER, {STREAM: stream_id}, count=1, block=wait)
        entries = reply[0][1] if reply else []
        if entries:
            return [(_text(mid), _text(fields.get(b"id") or fields.get("id"))) for mid, fields in entries]
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
