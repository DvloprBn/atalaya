"""Punto de entrada: `python -m atalaya_worker`. Un bucle: latir, y atender la cola de análisis.

Qué NO hace, a propósito: no tiene internet (red `data`), no escribe en disco (solo lectura), no corre como root,
y en la base solo toca el estado de `uploads` (ver store.py). Un archivo hostil cae en el lugar menos útil posible.
"""

import logging
import os
import signal
import sys
import threading

import psycopg
import redis

from .heartbeat import run_heartbeat
from .jobs import dispatch, ensure_group, fetch
from .store import Store

log = logging.getLogger("atalaya.worker")
BLOCK_MS = 5_000  # cuánto espera la cola antes de volver a mirar si hay que detenerse


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    redis_url, database_url = os.environ.get("REDIS_URL"), os.environ.get("DATABASE_URL")
    if not redis_url or not database_url:
        # Igual que la API: sin configuración completa, no se arranca.
        log.error("Faltan REDIS_URL o DATABASE_URL")
        return 1
    uploads_dir = os.environ.get("UPLOAD_DIR", "/data/uploads")
    results_dir = os.environ.get("RESULTS_DIR", "/data/results")

    # lib_name/lib_version=None: no manda CLIENT SETINFO (el usuario de Redis del worker no tiene ese permiso).
    queue = redis.Redis.from_url(redis_url, socket_timeout=10, socket_connect_timeout=5, lib_name=None, lib_version=None)
    db = Store(database_url)

    # Docker detiene el contenedor con SIGTERM: salimos limpio en vez de morir a la mitad.
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())

    threading.Thread(target=run_heartbeat, args=(queue, stop), daemon=True, name="heartbeat").start()
    log.info("worker listo")
    grouped = False
    while not stop.is_set():
        try:
            if not grouped:
                ensure_group(queue)
                grouped = True
            for stream, message_id, item_id in fetch(queue, BLOCK_MS):
                dispatch(queue, db, uploads_dir, results_dir, stream, message_id, item_id)
        except (redis.RedisError, psycopg.Error, OSError) as error:
            # Un fallo de Redis o de la base no tumba al worker: se reintenta. Solo el TIPO del error,
            # porque el mensaje puede incluir la URL con la contraseña.
            log.warning("fallo recuperable: %s", type(error).__name__)
            db.reset()
            grouped = False
            stop.wait(3)

    log.info("worker detenido")
    return 0


if __name__ == "__main__":
    sys.exit(main())
