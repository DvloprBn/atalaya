"""Revisión profunda de un CSV: UTF-8 válido, forma razonable y no vacío. No interpreta valores (eso es v0.9)."""

import csv
import io

from .limits import MAX_COLS, MAX_ROWS
from .verdict import Reject

_MAX_FIELD = 1 << 20  # 1 MB por celda; más es un ataque o un archivo roto


def inspect_csv(data: bytes) -> None:
    try:
        text = data.decode("utf-8-sig")  # -sig: tolera la marca BOM que pone Excel
    except UnicodeDecodeError:
        raise Reject("corrupt") from None
    if "\x00" in text:
        raise Reject("corrupt")

    rows = 0
    try:
        # strict: una comilla sin cerrar es un error, no se «adivina».
        for record in csv.reader(io.StringIO(text, newline=""), strict=True):
            if not any(cell.strip() for cell in record):
                continue  # línea en blanco
            rows += 1
            if len(record) > MAX_COLS or rows > MAX_ROWS:
                raise Reject("range_too_large")
            if any(len(cell) > _MAX_FIELD for cell in record):
                raise Reject("corrupt")
    except csv.Error:
        raise Reject("corrupt") from None
    # Solo el encabezado (o nada) no es un archivo con datos.
    if rows < 2:
        raise Reject("empty")
