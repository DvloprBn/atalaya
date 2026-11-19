"""De comprobantes CFDI a una TABLA VIRTUAL: un renglón por concepto, como si fuera un CSV.

Desde aquí todo lo demás (el mapeo, la limpieza, el informe de calidad, los indicadores) funciona SIN CAMBIOS: un CFDI no
tiene un camino aparte, solo un lector distinto. Lo que no es una venta o un gasto no se pierde en silencio: se anota en
`Table.skipped` y la limpieza lo cuenta como descartado.
"""

import re
from decimal import Decimal

from .cfdi import Document
from .tabular import Table

HEADER = [
    "fecha", "uuid", "folio", "tipo", "emisor_rfc", "emisor_nombre", "receptor_rfc", "receptor_nombre",
    "concepto", "cantidad", "importe", "iva", "moneda",
]  # fmt: skip
SIGN = {"I": 1, "E": -1}  # Ingreso suma; Egreso (nota de crédito) es una devolución y resta
_NUMBER = re.compile(r"-?\d+(\.\d+)?")
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}(?=T|$)")


def _signed(text: str, sign: int) -> str:
    """Un egreso lleva sus cifras en negativo; lo que no es un número se deja tal cual (la limpieza lo contará)."""
    return format(-Decimal(text), "f") if sign < 0 and _NUMBER.fullmatch(text) and Decimal(text) != 0 else text


def build_cfdi_table(documents: list[Document]) -> Table:
    rows: list[tuple[int, list[object]]] = []
    unsupported: list[tuple[str, str]] = []
    for doc in documents:
        if doc.kind not in SIGN:  # un pago (P), un traslado (T) o una nómina (N): no es una venta ni un gasto
            unsupported.append(("unsupported_document", doc.kind or "(sin tipo)"))
            continue
        if doc.currency != "MXN":  # no se convierte con un tipo de cambio que el archivo declara y nadie verifica
            unsupported.append(("unsupported_currency", doc.currency or "(sin moneda)"))
            continue
        sign = SIGN[doc.kind]
        day = _DATE.match(doc.date)  # la fecha de emisión SIN hora y sin mover de zona; lo que no cumpla lo contará la limpieza
        for concept in doc.concepts:
            rows.append((len(rows) + 2, [
                day.group(0) if day else doc.date, doc.uuid, doc.folio, doc.kind, doc.issuer_rfc, doc.issuer_name,
                doc.receiver_rfc, doc.receiver_name, concept.description, _signed(concept.quantity, sign),
                _signed(concept.amount, sign), _signed(concept.vat, sign), doc.currency,
            ]))  # fmt: skip
    # Cada comprobante descartado ocupa UN renglón virtual al final (el 2 es el primero de datos: el 1 es el encabezado).
    skipped = [(code, len(rows) + 2 + i, raw) for i, (code, raw) in enumerate(unsupported)]
    return Table(HEADER, iter(rows), skipped)
