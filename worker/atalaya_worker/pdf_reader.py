"""Leer un PDF sin que un PDF hostil tumbe al worker: el trabajo lo hace un proceso hijo (pdf_child.py) con topes.

Aquí vive lo que el padre decide: arrancar al hijo, matarlo si se pasa del tiempo, traducir cómo terminó a un motivo de
la lista cerrada y validar lo que devolvió (es DATO derivado de un archivo hostil: se revisa su forma antes de usarlo).
Después arma la «tabla lógica»: la primera tabla y sus continuaciones en páginas siguientes.
"""

import json
import os
import signal
import subprocess  # noqa: S404 - se ejecuta SIEMPRE el mismo intérprete con el mismo script; el PDF va por stdin
import sys

from .failure import AnalysisFail
from .limits import (
    MAX_COLS,
    MAX_PDF_CELL,
    MAX_PDF_DEPTH,
    MAX_PDF_OBJECTS,
    MAX_PDF_OUTPUT,
    MAX_PDF_PAGES,
    MAX_ROWS,
    PDF_CPU_SECONDS,
    PDF_MEMORY_BYTES,
    PDF_WALL_SECONDS,
)
from .verdict import REASONS, Reject

_CHILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_child.py")
_LIMITS = json.dumps(
    {
        "memory": PDF_MEMORY_BYTES,
        "cpu": PDF_CPU_SECONDS,
        "pages": MAX_PDF_PAGES,
        "objects": MAX_PDF_OBJECTS,
        "depth": MAX_PDF_DEPTH,
        "cell": MAX_PDF_CELL,
        "output": MAX_PDF_OUTPUT,
    }
)
_KILLED_BY_CLOCK = {-signal.SIGXCPU, -signal.SIGKILL}  # se acabó su CPU, o lo mató el reloj de pared


def _run_child(data: bytes) -> dict:
    """Corre al hijo y devuelve su respuesta. `TimeoutError` si se pasó del tiempo; `Reject` con cualquier otro final malo."""
    # -I: modo aislado (sin variables PYTHON*, sin la carpeta del script ni la actual en la ruta de imports).
    # env vacío y cwd «/»: el hijo no hereda nada del worker (ni las URLs de la base y de Redis con sus contraseñas).
    with subprocess.Popen(  # noqa: S603 - argumentos fijos, sin shell
        [sys.executable, "-I", _CHILD, _LIMITS],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,  # pdfminer avisa con texto del archivo: no se guarda en ningún registro
        env={},
        cwd="/",
    ) as child:
        try:
            out, _ = child.communicate(data, timeout=PDF_WALL_SECONDS)
        except subprocess.TimeoutExpired:
            raise TimeoutError from None
        finally:
            if child.poll() is None:  # también si el SIGALRM de la revisión llegó mientras esperábamos
                child.kill()
                child.wait()
    if child.returncode in _KILLED_BY_CLOCK:
        raise TimeoutError
    try:
        answer = json.loads(out)
    except ValueError:
        raise Reject("corrupt") from None  # murió sin contestar (p. ej. una falla dentro de código nativo)
    if child.returncode != 0 or not isinstance(answer, dict):
        raise Reject("corrupt")
    return answer


def _tables(answer: dict) -> list[tuple[int, list[list[str]]]]:
    """La respuesta del hijo con su forma comprobada: `[(página, filas)]`. Si no la tiene, el archivo se trata como dañado."""
    if "reject" in answer:
        reason = answer["reject"]
        raise Reject(reason if reason in REASONS else "corrupt")
    tables = answer.get("tables")
    if not isinstance(tables, list) or not tables:
        raise Reject("corrupt")
    result = []
    for t in tables:
        page, rows = (t.get("page"), t.get("rows")) if isinstance(t, dict) else (None, None)
        ok_rows = isinstance(rows, list) and all(isinstance(r, list) and all(isinstance(c, str) for c in r) for r in rows)
        if not isinstance(page, int) or not ok_rows:
            raise Reject("corrupt")
        if any(len(r) > MAX_COLS for r in rows):
            raise Reject("range_too_large")
        result.append((page, rows))
    if sum(len(rows) for _, rows in result) > MAX_ROWS:  # los mismos topes que una hoja de cálculo (v0.8)
        raise Reject("range_too_large")
    return result


def inspect_pdf(data: bytes) -> None:
    """La revisión profunda (v0.8) de un PDF: lo abre el hijo; si algo falla, `Reject` con su motivo."""
    _tables(_run_child(data))


def read_pdf_tables(data: bytes) -> list[tuple[int, list[list[str]]]]:
    """Las tablas del PDF para el análisis. El motivo fino ya lo dio la revisión del archivo: aquí solo «no se pudo leer»."""
    try:
        return _tables(_run_child(data))
    except Reject:
        raise AnalysisFail("unreadable") from None
