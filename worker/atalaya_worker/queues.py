"""Los nombres de las colas (Redis Streams). La API los usa con los mismos nombres: `api/src/uploads` y `api/src/analyses`."""

UPLOAD_STREAM = "atalaya:uploads"
ANALYSIS_STREAM = "atalaya:analyses"
STREAMS = (UPLOAD_STREAM, ANALYSIS_STREAM)
GROUP = "workers"
CONSUMER = "worker-1"  # estable a propósito: sus pendientes se recuperan al reiniciar
