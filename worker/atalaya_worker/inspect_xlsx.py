"""Revisión profunda de un .xlsx. Un .xlsx es un zip de XML: los dos riesgos son el ZIP y el XML.

  ZIP: bomba (pocos KB que se vuelven GB), demasiadas entradas, entradas cifradas o con ruta traicionera.
  XML: entidades que se expanden o leen archivos (XXE, «billion laughs») → defusedxml las prohíbe;
       y un rango GIGANTE (A1:XFD1048576) que haría reservar memoria a quien lea la hoja después.

Nada se extrae a disco: todo se lee en memoria, por trozos y con tope, contando los bytes REALES
que salen (la cabecera del zip puede mentir sobre el tamaño; el descompresor no).
"""

import io
import re
import zipfile
from collections.abc import Iterator
from zlib import error as zlib_error

from defusedxml import DefusedXmlException
from defusedxml.ElementTree import ParseError, iterparse

from .limits import (
    CHUNK,
    MAX_COLS,
    MAX_RATIO,
    MAX_ROWS,
    MAX_UNCOMPRESSED_BYTES,
    MAX_XML_BYTES,
    MAX_ZIP_ENTRIES,
)
from .verdict import Reject

_SHEET = re.compile(r"^xl/worksheets/[^/]+\.xml$")
_CELL_REF = re.compile(r"^([A-Z]{1,3})(\d{1,7})$")


def _col_number(letters: str) -> int:
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def _check_zip(zf: zipfile.ZipFile, compressed_size: int) -> None:
    infos = zf.infolist()
    if len(infos) > MAX_ZIP_ENTRIES:
        raise Reject("too_many_entries")
    names = [i.filename for i in infos]
    if len(set(names)) != len(names):
        raise Reject("corrupt")  # nombres repetidos: se usan para esconder contenido
    declared = 0
    for info in infos:
        if info.flag_bits & 0x1:
            raise Reject("corrupt")  # entrada cifrada: no se puede revisar
        if info.filename.startswith(("/", "\\")) or ".." in info.filename.split("/"):
            raise Reject("corrupt")  # ruta traicionera (zip slip); aunque no extraemos, no se admite
        declared += info.file_size
    if "xl/vbaProject.bin" in names or any(n.lower().endswith("vbaproject.bin") for n in names):
        raise Reject("corrupt")  # macros (la API ya las rechaza; aquí se repite: defensa en capas)
    if declared > MAX_UNCOMPRESSED_BYTES or declared > MAX_RATIO * max(compressed_size, 1):
        raise Reject("zip_bomb")


def _capped(zf: zipfile.ZipFile, name: str, budget: list[int]) -> Iterator[bytes]:
    """Los bytes de una entrada, por trozos, contando lo REAL descomprimido contra el presupuesto total."""
    produced = 0
    with zf.open(name) as stream:
        while chunk := stream.read(CHUNK):
            produced += len(chunk)
            budget[0] -= len(chunk)
            if budget[0] < 0 or produced > MAX_XML_BYTES:
                raise Reject("zip_bomb")
            yield chunk


class _Feed(io.RawIOBase):
    """Adapta un generador de trozos a un archivo legible (lo que iterparse espera)."""

    def __init__(self, chunks: Iterator[bytes]) -> None:
        self._chunks, self._rest = chunks, b""

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:  # noqa: ANN001
        while not self._rest:
            try:
                self._rest = next(self._chunks)
            except StopIteration:
                return 0
        n = min(len(buffer), len(self._rest))
        buffer[:n], self._rest = self._rest[:n], self._rest[n:]
        return n


def _scan_sheet(zf: zipfile.ZipFile, name: str, budget: list[int]) -> int:
    """Recorre una hoja sin cargarla entera. Devuelve cuántas celdas tiene; rechaza rangos gigantes."""
    cells = rows = 0
    try:
        events = iterparse(io.BufferedReader(_Feed(_capped(zf, name, budget))), events=("end",), forbid_dtd=True)
        for _, el in events:
            tag = el.tag.rsplit("}", 1)[-1]
            if tag == "dimension":
                ref = (el.get("ref") or "").split(":")[-1]
                m = _CELL_REF.match(ref)
                if m and (_col_number(m[1]) > MAX_COLS or int(m[2]) > MAX_ROWS):
                    raise Reject("range_too_large")  # lo DECLARADO ya basta para rechazar
            elif tag == "c":
                cells += 1
                m = _CELL_REF.match(el.get("r") or "")
                if m and (_col_number(m[1]) > MAX_COLS or int(m[2]) > MAX_ROWS):
                    raise Reject("range_too_large")
            elif tag == "row":
                rows += 1
                if rows > MAX_ROWS or int(el.get("r") or 0) > MAX_ROWS:
                    raise Reject("range_too_large")
            el.clear()  # la memoria no crece con el archivo
    except ParseError, DefusedXmlException, ValueError:
        raise Reject("corrupt") from None
    return cells


def inspect_xlsx(data: bytes) -> None:
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile, ValueError:
        raise Reject("corrupt") from None
    with zf:
        _check_zip(zf, len(data))
        names = set(zf.namelist())
        if "xl/workbook.xml" not in names or "[Content_Types].xml" not in names:
            raise Reject("corrupt")
        budget = [MAX_UNCOMPRESSED_BYTES]
        try:
            total_cells = sum(_scan_sheet(zf, n, budget) for n in sorted(names) if _SHEET.match(n))
        except zipfile.BadZipFile, zlib_error, EOFError, NotImplementedError:
            raise Reject("corrupt") from None
    if total_cells == 0:
        raise Reject("empty")
