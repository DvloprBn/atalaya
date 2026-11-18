"""Revisar UN archivo de punta a punta: leerlo con cuidado, confirmar que es el que la API guardó y mirarlo por dentro."""

import hashlib
import os
import re
import signal
import stat

from .inspect_csv import inspect_csv
from .inspect_xlsx import inspect_xlsx
from .limits import SECONDS_PER_FILE
from .store import Job
from .verdict import Reject

_KEY = re.compile(r"^[0-9a-f]{32}$")
_PK = b"PK\x03\x04"


def _read(uploads_dir: str, job: Job) -> bytes:
    if not _KEY.match(job.storage_key):
        raise Reject("corrupt")
    path = os.path.join(uploads_dir, job.storage_key)
    try:
        # O_NOFOLLOW: si alguien dejara un enlace simbólico en lugar del archivo, no se sigue.
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except OSError:
        raise Reject("corrupt") from None
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size != job.size_bytes:
            raise Reject("corrupt")
        data = handle.read(job.size_bytes + 1)  # +1: si hay más de lo anotado, se nota
    if len(data) != job.size_bytes:
        raise Reject("corrupt")
    return data


def _on_alarm(_signum, _frame) -> None:  # noqa: ANN001
    raise TimeoutError


def review(uploads_dir: str, job: Job) -> str | None:
    """Devuelve None si el archivo pasó, o el motivo de rechazo. Con tope de tiempo (SIGALRM)."""
    previous = signal.signal(signal.SIGALRM, _on_alarm)
    signal.alarm(SECONDS_PER_FILE)
    try:
        data = _read(uploads_dir, job)
        # El worker NO se fía de la API: confirma que los bytes son los que ella guardó...
        if hashlib.sha256(data).hexdigest() != job.sha256:
            raise Reject("corrupt")
        # ...y repite la comprobación de firma (defensa en capas).
        if job.kind == "xlsx":
            if not data.startswith(_PK):
                raise Reject("corrupt")
            inspect_xlsx(data)
        elif job.kind == "csv":
            if data.startswith(_PK):
                raise Reject("corrupt")
            inspect_csv(data)
        else:
            raise Reject("corrupt")
        return None
    except Reject as rejected:
        return rejected.reason
    except TimeoutError:
        return "worker_timeout"
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)
