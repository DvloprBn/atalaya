"""La vista previa: qué columnas tiene el archivo, unos ejemplos y un mapeo SUGERIDO (la persona lo confirma)."""

import re
import unicodedata

from .limits import NAME_LEN, SAMPLE_LEN
from .tabular import Table
from .text import cell_text, clean_text
from .values import decide_date_order, decide_decimal_separator, parse_amount, parse_date

# Palabras que suelen usar los encabezados de ventas, en español e inglés (ya sin acentos ni signos).
SYNONYMS: dict[str, tuple[str, ...]] = {
    "date": ("fecha", "date", "dia", "timestamp", "fecha venta", "fecha de venta", "fecha pedido"),
    "amount": ("importe", "total", "monto", "amount", "venta", "ventas", "precio", "subtotal", "ingreso", "price", "revenue"),
    "quantity": ("cantidad", "cant", "qty", "quantity", "unidades", "piezas"),
    "product": ("producto", "articulo", "item", "descripcion", "product", "sku", "concepto", "categoria", "category", "rubro"),
    "branch": ("sucursal", "tienda", "branch", "store", "local", "ubicacion", "sede"),
    "orderId": ("uuid", "folio fiscal", "folio", "ticket", "orden", "pedido", "order", "factura", "transaccion", "id"),
}
_CONTENT_SAMPLE = 200  # filas que se miran para adivinar por contenido (fecha / importe)


def _normalize(name: str) -> str:
    """Minúsculas, sin acentos ni signos: «Fecha de Venta» y «fecha_de_venta» comparan igual."""
    plain = unicodedata.normalize("NFKD", name.lower()).encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", plain).split())


def _by_name(header: list[str]) -> dict[str, int]:
    found: dict[str, int] = {}
    names = [_normalize(h) for h in header]
    for field, words in SYNONYMS.items():
        for index, name in enumerate(names):
            if index not in found.values() and name in words:
                found[field] = index
                break
    return found


def _share(values: list[object], accepts) -> float:
    filled = [v for v in values if cell_text(v).strip()]
    return sum(1 for v in filled if accepts(v)) / len(filled) if filled else 0.0


def _by_content(sample: list[list[object]], found: dict[str, int], width: int) -> None:
    """Para fecha e importe, si el nombre no ayudó: la columna donde casi todo parece fecha, o casi todo un número."""
    free = [i for i in range(width) if i not in found.values()]
    if "date" not in found:
        for i in free:
            column = [row[i] for row in sample]
            order, _ = decide_date_order([cell_text(v) for v in column])
            if _share(column, lambda v, o=order: parse_date(v, o)[0] is not None) >= 0.8:
                found["date"] = i
                break
    free = [i for i in free if i not in found.values()]
    if "amount" not in found:
        for i in free:
            column = [row[i] for row in sample]
            sep = decide_decimal_separator([cell_text(v) for v in column])
            if _share(column, lambda v, s=sep: parse_amount(v, s) is not None) >= 0.8:
                found["amount"] = i
                break


def build_preview(table: Table) -> dict:
    width = len(table.header)
    samples: list[list[str]] = [[] for _ in range(width)]
    sample_rows: list[list[object]] = []
    row_count = 0
    for _, cells in table.rows:
        if not any(cell_text(c).strip() for c in cells):
            continue
        row_count += 1
        if len(sample_rows) < _CONTENT_SAMPLE:
            sample_rows.append(cells)
        for i, cell in enumerate(cells):
            text = clean_text(cell, SAMPLE_LEN)
            if text and len(samples[i]) < 5:
                samples[i].append(text)
    suggested = _by_name(table.header)
    _by_content(sample_rows, suggested, width)
    return {
        "columns": [{"index": i, "name": clean_text(table.header[i], NAME_LEN), "samples": samples[i]} for i in range(width)],
        "rowCount": row_count,
        "suggested": suggested,
    }
