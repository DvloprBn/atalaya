"""Indicadores básicos: cuánto, cuándo y con qué ritmo. Todo en `Decimal`; el redondeo, una sola vez al darle forma."""

from collections import defaultdict
from decimal import Decimal

from .cleaner import CleanRow
from .quant import cents, percent
from .series import daily_totals

TOP_BRANCHES = 10


def build_indicators(rows: list[CleanRow]) -> dict:
    daily = daily_totals(rows)
    gross = sum((r.amount for r in rows if r.amount > 0), Decimal(0))
    returns = -sum((r.amount for r in rows if r.amount < 0), Decimal(0))
    net = sum((r.amount for r in rows), Decimal(0))

    # Pedidos: solo si el archivo trae la columna. El ticket es el neto de las filas CON pedido entre los pedidos distintos.
    orders = {r.order_id for r in rows if r.order_id}
    with_order = sum((r.amount for r in rows if r.order_id), Decimal(0))

    best = max(daily.items(), key=lambda kv: (kv[1], -kv[0].toordinal()))  # el mayor; en empate, el más antiguo
    worst = min(daily.items(), key=lambda kv: (kv[1], kv[0].toordinal()))
    return {
        "grossAmount": cents(gross),
        "returnsAmount": cents(returns),
        "netAmount": cents(net),
        "rows": len(rows),
        "activeDays": len(daily),
        "averagePerActiveDay": cents(net / len(daily)),
        "orders": len(orders) if orders else None,
        "averageTicket": cents(with_order / len(orders)) if orders else None,
        "bestDay": {"date": best[0].isoformat(), "amount": cents(best[1])},
        "worstDay": {"date": worst[0].isoformat(), "amount": cents(worst[1])},
    }


def build_monthly(rows: list[CleanRow]) -> list[dict]:
    """Un punto por mes CON datos, y el cambio contra el mes anterior con datos (null en el primero o si el anterior suma 0)."""
    amount: dict[str, Decimal] = defaultdict(Decimal)
    count: dict[str, int] = defaultdict(int)
    for r in rows:
        key = f"{r.date.year:04d}-{r.date.month:02d}"
        amount[key] += r.amount
        count[key] += 1
    points, previous = [], None
    for key in sorted(amount):
        change = None
        if previous is not None and amount[previous] != 0:
            change = percent((amount[key] - amount[previous]) * 100 / abs(amount[previous]))
        points.append({"month": key, "amount": cents(amount[key]), "rows": count[key], "changePercent": change})
        previous = key
    return points


def build_weekdays(rows: list[CleanRow]) -> list[dict]:
    """El promedio del total diario de cada día de la semana (ISO: lunes = 1), sobre los días que tienen datos."""
    by_weekday: dict[int, list[Decimal]] = defaultdict(list)
    for day, total in daily_totals(rows).items():
        by_weekday[day.isoweekday()].append(total)
    return [{"weekday": w, "average": cents(sum(v, Decimal(0)) / len(v)), "days": len(v)} for w, v in sorted(by_weekday.items())]


def build_branches(rows: list[CleanRow]) -> list[dict] | None:
    """Las 10 mayores sucursales por importe neto POSITIVO. None si el archivo no trae la columna."""
    if not any(r.branch for r in rows):
        return None
    totals: dict[str, Decimal] = defaultdict(Decimal)
    for r in rows:
        totals[r.branch or "(sin sucursal)"] += r.amount
    positive = sorted(((n, a) for n, a in totals.items() if a > 0), key=lambda kv: (-kv[1], kv[0]))
    whole = sum((a for _, a in positive), Decimal(0))
    return [{"name": n, "amount": cents(a), "sharePercent": percent(a * 100 / whole)} for n, a in positive[:TOP_BRANCHES]]
