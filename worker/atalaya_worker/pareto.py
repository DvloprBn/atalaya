"""Pareto: qué pocos elementos concentran casi todo el importe. Sirve para decidir dónde mirar primero."""

from collections import defaultdict
from decimal import Decimal

from .cleaner import CleanRow
from .quant import cents, percent

TOP = 20
CLASS_A_UP_TO = Decimal(80)
CLASS_B_UP_TO = Decimal(95)
NO_NAME = "(sin nombre)"


def build_pareto(rows: list[CleanRow]) -> dict | None:
    """None si el archivo no trae la columna de producto (o categoría, en gastos)."""
    if not any(r.product for r in rows):
        return None
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for r in rows:
        totals[r.product or NO_NAME] += r.amount  # el neto del elemento: sus devoluciones le restan

    ranked = sorted(((n, a) for n, a in totals.items() if a > 0), key=lambda kv: (-kv[1], kv[0]))  # empate: por nombre
    whole = sum((a for _, a in ranked), Decimal(0))
    items, running = [], Decimal(0)
    for name, amount in ranked[:TOP]:
        # La clase la decide lo acumulado ANTES de sumar este elemento: el que cruza el 80 % todavía es de la clase A
        # (si no, la clase A se quedaría corta del 80 %).
        before = running * 100 / whole
        running += amount
        klass = "A" if before < CLASS_A_UP_TO else "B" if before < CLASS_B_UP_TO else "C"
        items.append(
            {
                "name": name,
                "amount": cents(amount),
                "sharePercent": percent(amount * 100 / whole),
                "cumulativePercent": percent(running * 100 / whole),  # sobre el valor EXACTO, no sobre porcentajes ya redondeados
                "class": klass,
            }
        )
    rest = ranked[TOP:]
    return {
        "items": items,
        "otherCount": len(rest),
        "otherAmount": cents(sum((a for _, a in rest), Decimal(0))),
        "nonPositiveCount": sum(1 for a in totals.values() if a <= 0),  # sin ventas netas: no entran en el Pareto
    }
