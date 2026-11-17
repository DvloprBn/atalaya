"""Punto de entrada: `python -m atalaya_worker`.

v0.1: solo late. En v0.7 este mismo bucle leerá trabajos de la cola de análisis.
"""

import logging
import os
import signal
import sys
import threading

import redis

from .heartbeat import HEARTBEAT_EVERY_SECONDS, beat

log = logging.getLogger("atalaya.worker")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        # Igual que la API: sin configuración completa, no se arranca.
        log.error("Falta la variable de entorno REDIS_URL")
        return 1

    store = redis.Redis.from_url(redis_url, socket_timeout=5, socket_connect_timeout=5)

    # Docker detiene el contenedor con SIGTERM: salimos limpio en vez de morir a la mitad.
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())

    log.info("worker listo")
    while not stop.is_set():
        try:
            beat(store)
        except redis.RedisError as error:
            # Un fallo de Redis no tumba al worker: se reintenta en el siguiente latido.
            # Se registra solo el tipo de error; el mensaje puede incluir la URL con la contraseña.
            log.warning("no se pudo escribir el latido: %s", type(error).__name__)
        stop.wait(HEARTBEAT_EVERY_SECONDS)

    log.info("worker detenido")
    return 0


if __name__ == "__main__":
    sys.exit(main())
