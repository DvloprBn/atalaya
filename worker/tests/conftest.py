"""Fábricas de archivos de prueba: se construyen aquí, en memoria; no hay archivos binarios en el repo."""

import io
import zipfile

import pytest

CONTENT_TYPES = "[Content_Types].xml"
NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'


def sheet_xml(rows: int = 3, cols: int = 2, dimension: str | None = None) -> str:
    dim = f'<dimension ref="{dimension}"/>' if dimension else ""
    body = "".join(
        f'<row r="{r}">' + "".join(f'<c r="{chr(64 + c)}{r}"><v>{r}</v></c>' for c in range(1, cols + 1)) + "</row>"
        for r in range(1, rows + 1)
    )
    return f'<?xml version="1.0"?><worksheet {NS}>{dim}<sheetData>{body}</sheetData></worksheet>'


def make_zip(entries: dict[str, str | bytes], *, deflate: bool = True) -> bytes:
    buf = io.BytesIO()
    method = zipfile.ZIP_DEFLATED if deflate else zipfile.ZIP_STORED
    with zipfile.ZipFile(buf, "w", method) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def make_xlsx(sheet: str | None = None, **extra: str | bytes) -> bytes:
    entries: dict[str, str | bytes] = {
        CONTENT_TYPES: "<Types/>",
        "xl/workbook.xml": "<workbook/>",
        "xl/worksheets/sheet1.xml": sheet if sheet is not None else sheet_xml(),
    }
    entries.update(extra)
    return make_zip(entries)


@pytest.fixture
def xlsx_factory():
    return make_xlsx
