"""Pronóstico a 14 días: el promedio de las últimas 8 veces que cayó ese día de la semana.

Es un PUNTO DE PARTIDA honesto, no un modelo: no ve tendencia, ni feriados, ni promociones. Por eso (1) el contrato lo
llama `weekday_average`, (2) trae un intervalo, y (3) trae su BACKTEST: el error que este mismo método habría tenido
sobre los últimos 14 días de los datos sin verlos. Un pronóstico sin su error medido es una promesa.
"""

from datetime import date, timedelta
from decimal import Decimal

from .cleaner import CleanRow
from .quant import cents, percent
from .series import MIN_DENSITY, daily_totals, density, filled

HORIZON = 14
OCCURRENCES = 8  # cuántas veces anteriores de ese día de la semana entran en el promedio
MIN_SPAN_DAYS = OCCURRENCES * 7  # 8 semanas de historia
Z_80 = Decimal("1.2816")  # intervalo de ≈ 80 %: promedio ± 1,28 desviaciones


def _estimate(series: dict[date, Decimal], target: date, history_end: date) -> tuple[Decimal, Decimal]:
    """(esperado, desviación) para `target` usando solo días ≤ `history_end` que caigan en su mismo día de la semana."""
    same = sorted(d for d in series if d <= history_end and d.isoweekday() == target.isoweekday())[-OCCURRENCES:]
    values = [series[d] for d in same]
    mean = sum(values, Decimal(0)) / len(values)
    variance = sum(((v - mean) ** 2 for v in values), Decimal(0)) / (len(values) - 1) if len(values) > 1 else Decimal(0)
    return mean, variance.sqrt()


def _backtest(series: dict[date, Decimal], last: date) -> dict | None:
    cut = last - timedelta(days=HORIZON)  # se «olvidan» los últimos 14 días y se les pronostica
    if (cut - min(series)).days + 1 < MIN_SPAN_DAYS:
        return None
    error = actual_sum = Decimal(0)
    for n in range(1, HORIZON + 1):
        day = cut + timedelta(days=n)
        expected, _ = _estimate(series, day, cut)
        error += abs(series[day] - expected)
        actual_sum += abs(series[day])
    wape = None if actual_sum == 0 else percent(error * 100 / actual_sum)
    return {"days": HORIZON, "wape": wape}


def build_forecast(rows: list[CleanRow]) -> dict:
    totals = daily_totals(rows)
    series = filled(totals)
    first, last = min(series), max(series)
    result = {"status": "insufficient_data", "method": "weekday_average", "horizonDays": HORIZON, "points": [], "backtest": None}
    # 8 semanas de HISTORIA (el rango de fechas) Y suficientes días CON datos (60 % del rango). Cuatro gastos sueltos repartidos
    # en tres meses cumplen lo primero; la renta y la nómina de un negocio cumplen lo primero y NO lo segundo: un promedio por
    # día de la semana sobre casi puros ceros no dice nada.
    if (last - first).days + 1 < MIN_SPAN_DAYS or density(totals) < MIN_DENSITY:
        return result

    no_negatives = all(v >= 0 for v in series.values())
    points = []
    for n in range(1, HORIZON + 1):
        day = last + timedelta(days=n)
        expected, deviation = _estimate(series, day, last)
        lower, upper = expected - Z_80 * deviation, expected + Z_80 * deviation
        if no_negatives:
            lower = max(lower, Decimal(0))  # unas ventas negativas no tienen sentido: el intervalo no baja de 0
        points.append({"date": day.isoformat(), "expected": cents(expected), "lower": cents(lower), "upper": cents(upper)})
    return {**result, "status": "ok", "points": points, "backtest": _backtest(series, last)}
