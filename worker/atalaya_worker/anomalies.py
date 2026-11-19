"""Anomalías: días que se salen de lo normal PARA SU DÍA DE LA SEMANA Y SU ÉPOCA.

Comparar contra el promedio general marcaría todos los sábados como «anomalía». Y comparar contra la mediana de TODOS
los sábados marcaría los de hace dos años (el negocio era más chico) y los de enero (temporada baja): lo aprendió una
prueba con un café que crece 1,25 % al mes. Por eso cada día se compara con el MISMO día de la semana de las 5 semanas
de cada lado (la mediana de sus vecinos, sin contarse a sí mismo), que absorbe la tendencia y la temporada.
El «qué tan raro es» se mide con la MAD (desviación absoluta mediana), que a diferencia de la desviación estándar no se
deja arrastrar por los mismos valores raros que busca.
"""

from datetime import date, timedelta
from decimal import Decimal

from .cleaner import CleanRow
from .quant import cents, median
from .series import MIN_ACTIVE_DAYS, MIN_DENSITY, daily_totals, density

THRESHOLD = Decimal("3.5")  # el umbral clásico para el puntaje robusto (Iglewicz y Hoaglin)
CONSISTENCY = Decimal("0.6745")  # hace que el puntaje robusto se parezca a un puntaje z en datos normales
MEAN_DEVIATION_FACTOR = Decimal("1.2533")  # lo mismo, cuando la MAD sale 0 y se usa la desviación media
MAX_ITEMS = 10
NEIGHBOR_WEEKS = 5  # cuántas semanas de cada lado entran en «lo normal» de un día
MIN_NEIGHBORS = 4  # con menos vecinos, se usa la mediana de todo ese día de la semana


def _expected(day: date, daily: dict[date, Decimal], overall: dict[int, Decimal]) -> Decimal:
    """La mediana del mismo día de la semana en las semanas vecinas (sin el propio día)."""
    neighbors = [
        daily[d] for k in range(1, NEIGHBOR_WEEKS + 1) for d in (day - timedelta(weeks=k), day + timedelta(weeks=k)) if d in daily
    ]
    return median(neighbors) if len(neighbors) >= MIN_NEIGHBORS else overall[day.isoweekday()]


def build_anomalies(rows: list[CleanRow]) -> dict:
    daily = daily_totals(rows)
    if len(daily) < MIN_ACTIVE_DAYS or density(daily) < MIN_DENSITY:
        return {"status": "insufficient_data", "items": []}  # decirlo es mejor que inventar

    by_weekday: dict[int, list[Decimal]] = {}
    for day, total in daily.items():
        by_weekday.setdefault(day.isoweekday(), []).append(total)
    overall = {w: median(v) for w, v in by_weekday.items()}  # respaldo en los extremos, donde faltan vecinos
    typical = {day: _expected(day, daily, overall) for day in daily}
    residual = {day: total - typical[day] for day, total in daily.items()}

    center = median(list(residual.values()))
    deviations = [abs(r - center) for r in residual.values()]
    scale = median(deviations)  # la MAD
    if scale == 0:
        # Datos muy regulares (la mitad de los días idénticos a lo típico): la MAD no sirve de escala. Se usa la
        # desviación media; si tampoco hay (todo idéntico), no hay nada raro que marcar.
        mean_dev = sum(deviations, Decimal(0)) / len(deviations)
        if mean_dev == 0:
            return {"status": "ok", "items": []}
        scored = {d: (r - center) / (MEAN_DEVIATION_FACTOR * mean_dev) for d, r in residual.items()}
    else:
        scored = {d: CONSISTENCY * (r - center) / scale for d, r in residual.items()}

    flagged = sorted((d for d, s in scored.items() if abs(s) >= THRESHOLD), key=lambda d: (-abs(scored[d]), d))[:MAX_ITEMS]
    return {
        "status": "ok",
        "items": [
            {
                "date": d.isoformat(),
                "amount": cents(daily[d]),
                "expected": cents(typical[d]),
                "direction": "high" if scored[d] > 0 else "low",
                "score": format(abs(scored[d]).quantize(Decimal("0.1")), "f"),
            }
            for d in flagged
        ],
    }
