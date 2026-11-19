"""De las tablas de un PDF a UNA tabla lógica, como si fuera un CSV.

Un reporte largo parte su tabla entre páginas: la primera tabla del documento es la buena, y las que la CONTINÚAN (mismo
número de columnas) se le pegan. Si una continuación repite el encabezado al inicio de su página, esa fila es el
encabezado, no un dato (como en un CSV). Una tabla con otro número de columnas (un resumen, unos totales) no se mezcla:
sus filas se anotan en `Table.skipped` como `table_skipped`, con la PÁGINA como número, y la limpieza las cuenta.
Desde aquí, el mapeo, la limpieza y el informe funcionan sin cambios.
"""

from .pdf_reader import read_pdf_tables
from .tabular import Table


def _width(rows: list[list[str]]) -> int:
    return max(len(r) for r in rows)


def _same(a: list[str], b: list[str]) -> bool:
    return [c.strip() for c in a] == [c.strip() for c in b]


def build_pdf_table(tables: list[tuple[int, list[list[str]]]]) -> Table:
    (_, first), rest = tables[0], tables[1:]
    width = _width(first)
    header = (first[0] + [""] * width)[:width]
    body = list(first[1:])
    skipped: list[tuple[str, int, str]] = []
    for page, rows in rest:
        if _width(rows) != width:
            # El ejemplo es la primera celda con algo: sirve para que la persona reconozca qué tabla se dejó fuera.
            skipped += [("table_skipped", page, next((c for c in r if c.strip()), "")) for r in rows]
            continue
        body += rows[1:] if _same(rows[0], header) else rows
    # Como en un CSV: el encabezado es la fila 1 y los datos empiezan en la 2; todas con el ancho del encabezado.
    numbered = [(n, (list(r) + [""] * width)[:width]) for n, r in enumerate(body, start=2)]
    return Table(header, iter(numbered), skipped)


def read_pdf(data: bytes) -> Table:
    return build_pdf_table(read_pdf_tables(data))
