"""Latido del worker: le avisa a la API que el worker está vivo.

Contrato interno con la API (ver contracts/README.md): cada HEARTBEAT_EVERY_SECONDS
se escribe la llave HEARTBEAT_KEY con vigencia HEARTBEAT_TTL_SECONDS. Si el worker
muere, la llave caduca sola y /api/health reporta worker = "down".
"""

import logging
import threading
from datetime import UTC, datetime
from typing import Protocol

HEARTBEAT_KEY = "atalaya:worker:heartbeat"
HEARTBEAT_EVERY_SECONDS = 10
HEARTBEAT_TTL_SECONDS = 30  # 3 latidos perdidos = caído


class KeyValueStore(Protocol):
    """Lo único que el latido necesita de Redis (permite probarlo sin Redis)."""

    def set(self, name: str, value: str, ex: int) -> object: ...


def beat(store: KeyValueStore, now: datetime | None = None) -> None:
    moment = now or datetime.now(UTC)
    store.set(HEARTBEAT_KEY, moment.isoformat(), ex=HEARTBEAT_TTL_SECONDS)


def run_heartbeat(store: KeyValueStore, stop: threading.Event) -> None:
    """Late en un HILO aparte: revisar un archivo grande puede tardar más que la vigencia del latido (30 s) y, sin
    esto, /api/health diría «worker caído» mientras trabaja. Un fallo de Redis no lo detiene: se reintenta."""
    log = logging.getLogger("atalaya.worker.heartbeat")
    while not stop.is_set():
        try:
            beat(store)
        except Exception as error:  # noqa: BLE001 - nada que ocurra aquí debe matar el hilo del latido
            # Solo el tipo: el mensaje de un error de Redis puede incluir la URL con la contraseña.
            log.warning("no se pudo escribir el latido: %s", type(error).__name__)
        stop.wait(HEARTBEAT_EVERY_SECONDS)
