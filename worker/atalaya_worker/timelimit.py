"""Tope de tiempo para una revisión: un archivo que cuelga al lector no cuelga al worker."""

import signal
from collections.abc import Iterator
from contextlib import contextmanager


def _on_alarm(_signum, _frame) -> None:  # noqa: ANN001
    raise TimeoutError


@contextmanager
def time_limit(seconds: int) -> Iterator[None]:
    """Lanza `TimeoutError` dentro del bloque si pasan `seconds`. Usa SIGALRM: solo funciona en el hilo principal."""
    previous = signal.signal(signal.SIGALRM, _on_alarm)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)
