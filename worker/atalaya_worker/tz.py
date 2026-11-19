"""La zona horaria del negocio. «Hoy» es una fecha que depende de DÓNDE estés.

Un contenedor corre en UTC. De las 18:00 a las 24:00 hora de México, en UTC ya es MAÑANA: con `date.today()` una venta
de hoy se descartaba como «fecha futura». Por eso «hoy» se calcula siempre aquí, en la zona del negocio.

Las fechas de un archivo son FECHAS (sin hora): no se mueven de zona. Una celda de fecha con hora de Excel se toma como
hora local del negocio (el archivo no dice zona: es un supuesto, y está dicho).
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

TIMEZONE_NAME = "America/Mexico_City"
BUSINESS_TZ = ZoneInfo(TIMEZONE_NAME)  # necesita la base de zonas: la trae el paquete `tzdata` (la imagen slim no)


def business_today(now: datetime | None = None) -> date:
    """La fecha de hoy en la zona del negocio. `now` (con zona) solo existe para poder probarlo."""
    moment = now or datetime.now(UTC)
    if moment.tzinfo is None:
        raise ValueError("`now` debe traer zona horaria")
    return moment.astimezone(BUSINESS_TZ).date()
