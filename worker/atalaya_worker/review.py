"""Revisar UN archivo de punta a punta: leerlo con cuidado, confirmar que es el que la API guardó y mirarlo por dentro."""

import hashlib
import os
import re
import stat

from .cfdi import parse_cfdi
from .cfdi_zip import read_cfdi_zip
from .inspect_csv import inspect_csv
from .inspect_xlsx import inspect_xlsx
from .limits import SECONDS_PER_FILE
from .store import Job
from .timelimit import time_limit
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


def load_verified(uploads_dir: str, job: Job) -> bytes:
    """Los bytes del archivo, ya confirmados: tamaño y SHA-256 iguales a lo que la API guardó. Si no, `Reject`."""
    data = _read(uploads_dir, job)
    if hashlib.sha256(data).hexdigest() != job.sha256:  # el worker NO se fía de la API ni del disco
        raise Reject("corrupt")
    return data


def review(uploads_dir: str, job: Job) -> str | None:
    """Devuelve None si el archivo pasó, o el motivo de rechazo. Con tope de tiempo (SIGALRM)."""
    try:
        with time_limit(SECONDS_PER_FILE):
            data = load_verified(uploads_dir, job)
            # ...y repite la comprobación de firma (defensa en capas).
            if job.kind == "xlsx":
                if not data.startswith(_PK):
                    raise Reject("corrupt")
                inspect_xlsx(data)
            elif job.kind == "csv":
                if data.startswith(_PK):
                    raise Reject("corrupt")
                inspect_csv(data)
            elif job.kind == "xml":
                if data.startswith(_PK):
                    raise Reject("corrupt")
                parse_cfdi(data)  # un solo comprobante: XML seguro (sin DOCTYPE) y con forma de CFDI
            elif job.kind == "zip":
                if not data.startswith(_PK):
                    raise Reject("corrupt")
                read_cfdi_zip(data)  # todas las entradas: UNA mala rechaza todo el ZIP
            else:
                raise Reject("corrupt")
        return None
    except Reject as rejected:
        return rejected.reason
    except TimeoutError:
        return "worker_timeout"
