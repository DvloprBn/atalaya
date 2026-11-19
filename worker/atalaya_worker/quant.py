"""Cuantizar y formatear: del `Decimal` exacto al texto del contrato. El redondeo ocurre UNA vez, al final, nunca entre pasos."""

from decimal import ROUND_HALF_UP, Decimal

from .values import money

_CENT = Decimal("0.01")
_TENTH = Decimal("0.1")


def cents(value: Decimal) -> str:
    """Importe con dos decimales exactos (`Money` del contrato). El cero nunca sale como «-0.00»."""
    rounded = value.quantize(_CENT, rounding=ROUND_HALF_UP)
    return money(Decimal("0.00") if rounded == 0 else rounded)


def percent(value: Decimal) -> str:
    """Porcentaje con un decimal (`Percent`): 12.5 es 12,5 %. El cero nunca sale como «-0.0»."""
    rounded = value.quantize(_TENTH, rounding=ROUND_HALF_UP)
    return format(Decimal("0.0") if rounded == 0 else rounded, "f")


def ratio_percent(part: Decimal, whole: Decimal) -> str | None:
    """`part / whole` en por ciento, o None si `whole` es 0 (no existe «cambio» contra la nada)."""
    return None if whole == 0 else percent(part * 100 / whole)


def median(values: list[Decimal]) -> Decimal:
    ordered = sorted(values)
    middle = len(ordered) // 2
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
