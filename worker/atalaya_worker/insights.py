"""Los indicadores de un análisis terminado, de punta a punta. Recibe las filas ya limpias y «hoy» (en la zona del negocio)."""

from datetime import date

from .anomalies import build_anomalies
from .cleaner import CleanRow
from .forecast import build_forecast
from .indicators import build_branches, build_indicators, build_monthly, build_weekdays
from .pareto import build_pareto
from .tz import TIMEZONE_NAME


def build_insights(rows: list[CleanRow], today: date) -> dict:
    return {
        "timezone": TIMEZONE_NAME,
        "asOf": today.isoformat(),
        "indicators": build_indicators(rows),
        "monthly": build_monthly(rows),
        "weekdays": build_weekdays(rows),
        "branches": build_branches(rows),
        "pareto": build_pareto(rows),
        "anomalies": build_anomalies(rows),
        "forecast": build_forecast(rows),
    }
