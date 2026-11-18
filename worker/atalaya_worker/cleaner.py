"""La limpieza: de las filas del archivo a filas válidas + un informe de calidad.

Reglas que no se rompen:
  - NADA se descarta sin quedar contado en el informe (con hasta 5 ejemplos).
  - Cada fila tira por UNA sola razón (la primera que falle, en este orden: vacía → fecha → importe → cantidad →
    duplicada), para que `rowsKept + rowsDropped == rowsRead` siempre cuadre.
  - Los problemas son una lista CERRADA (la del contrato); un problema nuevo es otro cambio de contrato.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from .failure import AnalysisFail
from .limits import EXAMPLES_PER_ISSUE, MAX_TEXT, SAMPLE_LEN
from .tabular import Table
from .text import cell_text, clean_text
from .values import decide_date_order, decide_decimal_separator, money, parse_amount, parse_date

FIELDS = ("date", "amount", "quantity", "product", "branch", "orderId")
TEXT_FIELDS = ("product", "branch", "orderId")
CODE_ORDER = (
    "blank_row", "duplicate_row", "bad_date", "future_date", "bad_amount", "negative_amount",
    "zero_amount", "bad_quantity", "ambiguous_dates", "text_trimmed", "text_truncated",
)  # fmt: skip
DROPPING = frozenset({"blank_row", "duplicate_row", "bad_date", "future_date", "bad_amount", "bad_quantity"})


@dataclass(frozen=True)
class CleanRow:
    date: date
    amount: Decimal
    quantity: Decimal | None
    product: str | None
    branch: str | None
    order_id: str | None


def check_mapping(mapping: dict, width: int) -> dict[str, int]:
    """La API ya lo validó; el worker NO se fía (defensa en capas). Devuelve solo los campos elegidos."""
    chosen = {f: mapping[f] for f in FIELDS if mapping.get(f) is not None}
    columns = list(chosen.values())
    ok = {"date", "amount"} <= chosen.keys() and all(isinstance(c, int) and 0 <= c < width for c in columns)
    if not ok or len(set(columns)) != len(columns):
        raise AnalysisFail("mapping_invalid")
    return chosen


class _Issues:
    """Cuenta los problemas y guarda hasta 5 ejemplos de cada uno."""

    def __init__(self) -> None:
        self.count: Counter[str] = Counter()
        self.examples: dict[str, list[dict]] = {}

    def add(self, code: str, row: int, raw: object) -> None:
        self.count[code] += 1
        found = self.examples.setdefault(code, [])
        if len(found) < EXAMPLES_PER_ISSUE:
            found.append({"row": row, "value": clean_text(raw, SAMPLE_LEN)})

    def as_list(self) -> list[dict]:
        return [
            {"code": c, "count": self.count[c], "dropped": c in DROPPING, "examples": self.examples[c]}
            for c in CODE_ORDER
            if self.count[c]
        ]


def clean(table: Table, mapping: dict, today: date | None = None) -> tuple[list[CleanRow], dict]:
    cols = check_mapping(mapping, len(table.header))
    rows = list(table.rows)  # ≤ 50 000 filas: hace falta verlas todas para decidir el formato de la columna
    limit = (today or date.today()) + timedelta(days=1)  # un día de holgura por la zona horaria

    # Formatos: lo que pidió la persona, o lo que dicen los datos de TODA la columna.
    order, evidence = (mapping.get("dateOrder") or "auto"), True
    if order == "auto":
        order, evidence = decide_date_order([cell_text(r[1][cols["date"]]) for r in rows])
    separator = mapping.get("decimalSeparator") or "auto"
    if separator == "auto":
        separator = decide_decimal_separator([cell_text(r[1][cols["amount"]]) for r in rows])

    issues, kept, seen = _Issues(), [], set()
    filled, invalid = Counter(), Counter()
    for number, cells in rows:
        if not any(cell_text(c).strip() for c in cells):
            issues.add("blank_row", number, "")
            continue
        for field, index in cols.items():
            filled[field] += bool(cell_text(cells[index]).strip())

        raw_date, raw_amount = cells[cols["date"]], cells[cols["amount"]]
        when, ambiguous = parse_date(raw_date, order)
        if when is None:
            invalid["date"] += 1
            issues.add("bad_date", number, raw_date)
            continue
        if when > limit:
            issues.add("future_date", number, raw_date)
            continue
        amount = parse_amount(raw_amount, separator)
        if amount is None:
            invalid["amount"] += 1
            issues.add("bad_amount", number, raw_amount)
            continue
        quantity = None
        if "quantity" in cols and cell_text(cells[cols["quantity"]]).strip():
            quantity = parse_amount(cells[cols["quantity"]], separator)
            if quantity is None:
                invalid["quantity"] += 1
                issues.add("bad_quantity", number, cells[cols["quantity"]])
                continue

        texts = {f: clean_text(cells[cols[f]], MAX_TEXT) or None if f in cols else None for f in TEXT_FIELDS}
        row = CleanRow(when, amount, quantity, texts["product"], texts["branch"], texts["orderId"])
        if row in seen:  # idéntica en TODO lo elegido: la primera se queda. (Un mismo pedido en varias líneas NO es duplicado.)
            issues.add("duplicate_row", number, raw_amount)
            continue
        seen.add(row)
        kept.append(row)

        if amount < 0:
            issues.add("negative_amount", number, raw_amount)
        elif amount == 0:
            issues.add("zero_amount", number, raw_amount)
        if ambiguous and not evidence:
            issues.add("ambiguous_dates", number, raw_date)
        for field in TEXT_FIELDS:
            if field in cols:
                full = clean_text(cells[cols[field]], 10**9)
                if full != cell_text(cells[cols[field]]).strip():
                    issues.add("text_trimmed", number, cells[cols[field]])
                if len(full) > MAX_TEXT:
                    issues.add("text_truncated", number, full)

    if not kept:
        raise AnalysisFail("nothing_left")
    total = sum((r.amount for r in kept), Decimal(0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    dates = [r.date for r in kept]
    report = {
        "rowsRead": len(rows),
        "rowsKept": len(kept),
        "rowsDropped": len(rows) - len(kept),
        "dateFrom": min(dates).isoformat(),
        "dateTo": max(dates).isoformat(),
        "totalAmount": money(total),
        "columns": [{"field": f, "filled": filled[f], "invalid": invalid[f]} for f in FIELDS if f in cols],
        "issues": issues.as_list(),
    }
    return kept, report
