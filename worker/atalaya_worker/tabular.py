"""Leer un CSV o un .xlsx como una tabla: encabezado + filas. Es lo único que toca openpyxl (los CFDI y los PDF tienen su lector).

openpyxl parsea XML de desconocidos, así que se usa lo más acotado que ofrece: modo de SOLO LECTURA (no carga la hoja
entera en memoria), solo VALORES (nunca fórmulas), sin vínculos externos; `defusedxml` está instalado y openpyxl lo
usa por su cuenta. Antes de llegar aquí el archivo ya pasó la revisión profunda de v0.8 (bomba zip, rangos, XXE).
"""

import csv
import io
from collections.abc import Iterator
from dataclasses import dataclass, field

from openpyxl import load_workbook

from .failure import AnalysisFail
from .limits import MAX_COLS, MAX_ROWS
from .text import cell_text

Row = tuple[int, list[object]]  # (número de fila en el archivo, celdas)


@dataclass
class Table:
    header: list[str]
    rows: Iterator[Row]  # solo datos (sin el encabezado), todas con el mismo ancho que el encabezado
    # Lo que el LECTOR descartó antes de que hubiera filas (un CFDI que es un pago, o está en otra moneda): (código del
    # problema, número de renglón, valor). La limpieza lo cuenta como leído y descartado: nada se pierde sin quedar contado.
    skipped: list[tuple[str, int, str]] = field(default_factory=list)


def _blank(cells: list[object]) -> bool:
    return not any(cell_text(c).strip() for c in cells)


def _fit(cells: list[object], width: int) -> list[object]:
    """Todas las filas con el ancho del encabezado: se rellenan con vacíos o se ignora lo que sobre."""
    return (list(cells) + [None] * width)[:width]


def _build(raw_rows: Iterator[list[object]]) -> Table:
    """El encabezado es la primera fila con algo; las filas anteriores (vacías) se saltan."""
    numbered = enumerate(raw_rows, start=1)
    for number, cells in numbered:
        if _blank(cells):
            continue
        header = [cell_text(c) for c in cells]
        while header and not header[-1].strip():  # columnas vacías a la derecha, típicas de un Excel arrastrado
            header.pop()
        if not header:
            raise AnalysisFail("no_header")
        if len(header) < 2:
            raise AnalysisFail("too_few_columns")
        if len(header) > MAX_COLS:
            raise AnalysisFail("unreadable")
        width = len(header)
        return Table(header, ((n, _fit(c, width)) for n, c in numbered if n <= MAX_ROWS + number))
    raise AnalysisFail("no_header")


def _delimiter(text: str) -> str:
    """Coma, punto y coma o tabulador: el que más aparece en la primera línea (el Excel en español exporta con «;»)."""
    first = next((line for line in text.splitlines() if line.strip()), "")
    return max(",;\t", key=lambda d: (first.count(d), d == ","))


def read_csv(data: bytes) -> Table:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AnalysisFail("unreadable") from None
    try:
        reader = csv.reader(io.StringIO(text, newline=""), delimiter=_delimiter(text), strict=True)
        return _build(iter(list(reader)))  # ≤ 5 MB: leerlo entero es barato y un error de formato salta aquí, no después
    except csv.Error:
        raise AnalysisFail("unreadable") from None


def read_xlsx(data: bytes) -> Table:
    try:
        book = load_workbook(io.BytesIO(data), read_only=True, data_only=True, keep_links=False)
        for sheet in book.worksheets:  # la primera hoja que tenga algo
            rows = [list(r) for r in sheet.iter_rows(values_only=True, max_row=MAX_ROWS + 50)]
            if any(not _blank(r) for r in rows):
                return _build(iter(rows))
    except AnalysisFail:
        raise
    except Exception:  # noqa: BLE001 - openpyxl lanza de todo con un archivo roto; para la persona es solo «no se pudo leer»
        raise AnalysisFail("unreadable") from None
    raise AnalysisFail("no_header")


def read_cfdi(data: bytes, kind: str) -> Table:
    # Se importan aquí (y no arriba) porque `cfdi_table` necesita `Table`, que vive en este módulo.
    from .cfdi import parse_cfdi
    from .cfdi_table import build_cfdi_table
    from .cfdi_zip import read_cfdi_zip
    from .verdict import Reject

    try:
        documents = [parse_cfdi(data)] if kind == "xml" else read_cfdi_zip(data)
    except Reject:
        raise AnalysisFail("unreadable") from None  # el motivo fino (not_cfdi, corrupt…) ya lo dio la revisión del archivo
    return build_cfdi_table(documents)


def read_table(data: bytes, kind: str) -> Table:
    if kind in ("xml", "zip"):
        return read_cfdi(data, kind)
    if kind == "pdf":
        from .pdf_table import read_pdf  # aquí y no arriba: `pdf_table` necesita `Table`, que vive en este módulo

        return read_pdf(data)
    if kind == "csv":
        return read_csv(data)
    if kind == "xlsx":
        return read_xlsx(data)
    raise AnalysisFail("unreadable")
