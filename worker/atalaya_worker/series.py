"""Las series de tiempo que comparten indicadores, anomalías y pronóstico: totales por día, ya netos."""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from .cleaner import CleanRow

MIN_ACTIVE_DAYS = (
    28  # cuatro semanas de días CON datos: menos, y anomalías y pronóstico serían una muestra de 1 o 2 por día de la semana
)


def daily_totals(rows: list[CleanRow]) -> dict[date, Decimal]:
    """Importe NETO de cada día con al menos una fila (las devoluciones restan)."""
    totals: dict[date, Decimal] = defaultdict(Decimal)
    for row in rows:
        totals[row.date] += row.amount
    return dict(totals)


def filled(totals: dict[date, Decimal]) -> dict[date, Decimal]:
    """La misma serie, con 0 en los días sin filas entre el primero y el último: para el pronóstico, un día sin ventas
    (domingo cerrado, por ejemplo) es información, no un hueco."""
    first, last = min(totals), max(totals)
    return {first + timedelta(days=n): totals.get(first + timedelta(days=n), Decimal(0)) for n in range((last - first).days + 1)}


def density(totals: dict[date, Decimal]) -> Decimal:
    """Qué parte de los días del rango tiene datos. Un café cerrado un día a la semana da ≈ 0.86; los gastos de un negocio
    (renta el 1, nómina el 15…) dan menos de 0.5: ahí «el total de cada día» casi siempre es 0 y analizar por día de la
    semana no dice nada."""
    span = (max(totals) - min(totals)).days + 1
    return Decimal(len(totals)) / span


MIN_DENSITY = Decimal("0.6")
