"""Fechas e importes tal como los escriben las personas. Reglas:

- Nada se adivina EN SILENCIO: lo ambiguo se decide por los datos de toda la columna y, si no hay pistas, se
  elige lo de México y el informe lo AVISA.
- El dinero es `Decimal`, nunca `float` (0.1 + 0.2 != 0.3 en punto flotante).
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .limits import MAX_ABS_AMOUNT, MAX_DECIMALS

# re.ASCII: `\d` solo acepta 0-9 (sin esto aceptaría también dígitos de otros alfabetos, como «١٢٣»).
_NUMERIC_DATE = re.compile(r"^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})(?:[ T].*)?$", re.ASCII)
_CURRENCY = re.compile(r"(?i)\b(mxn|usd|eur|pesos?|dlls?)\b|[$€£ ]")
_DIGITS_AND_SEPARATORS = re.compile(r"^[0-9.,\s']+$")


def _as_text(value: object) -> str:
    return str(value).strip()


# ───────────────────────────── Fechas ─────────────────────────────


def parse_date(value: object, order: str = "dmy") -> tuple[date | None, bool]:
    """(fecha, ambigua). `order` es 'dmy' o 'mdy' para `03/04/2026`; con año primero (2026-04-03) no hay duda."""
    if isinstance(value, datetime):
        return value.date(), False
    if isinstance(value, date):
        return value, False
    match = _NUMERIC_DATE.match(_as_text(value))
    if not match:
        return None, False
    first, second, third = match.groups()
    if len(first) == 4:  # AAAA-MM-DD: inequívoca
        year, month, day = int(first), int(second), int(third)
        ambiguous = False
    else:
        if order == "ymd" or len(third) not in (2, 4):
            return None, False
        year = int(third) + (2000 if len(third) == 2 else 0)
        month, day = (int(first), int(second)) if order == "mdy" else (int(second), int(first))
        ambiguous = int(first) <= 12 and int(second) <= 12 and int(first) != int(second)
    if not 1990 <= year <= 2100:
        return None, False
    try:
        return date(year, month, day), ambiguous
    except ValueError:
        return None, False


def decide_date_order(values: list[str]) -> tuple[str, bool]:
    """(orden, hubo_pistas). Un primer número > 12 solo puede ser día (dmy); un segundo > 12, solo puede ser mes (mdy)."""
    saw_dmy = saw_mdy = False
    for text in values:
        match = _NUMERIC_DATE.match(text.strip())
        if match and len(match[1]) != 4:
            saw_dmy |= int(match[1]) > 12
            saw_mdy |= int(match[2]) > 12
    if saw_mdy and not saw_dmy:
        return "mdy", True
    return "dmy", saw_dmy  # sin pistas (o pistas que chocan) se usa día/mes/año, el orden de México


# ───────────────────────────── Importes ─────────────────────────────


def _frac_len(text: str, sep: str) -> int:
    return len(text.rsplit(sep, 1)[1])


def decide_decimal_separator(values: list[str]) -> str:
    """'.' o ','. Cada valor vota por lo que implica su forma; `1,234.50` → punto; `1.234,50` → coma; `12,5` → coma."""
    comma_votes = dot_votes = 0
    for raw in values:
        text = _CURRENCY.sub("", raw).strip().lstrip("+-(").rstrip(")-")
        if not _DIGITS_AND_SEPARATORS.match(text):
            continue
        text = re.sub(r"[\s']", "", text)
        has_comma, has_dot = "," in text, "." in text
        if has_comma and has_dot:
            if text.rfind(",") > text.rfind("."):
                comma_votes += 1
            else:
                dot_votes += 1
        elif has_comma:
            if text.count(",") > 1:
                dot_votes += 1  # varias comas son millares → el decimal es el punto
            elif _frac_len(text, ",") != 3:
                comma_votes += 1  # «12,5» o «1234,5»; con 3 dígitos («1,234») es ambiguo y no vota
        elif has_dot:
            if text.count(".") > 1:
                comma_votes += 1
            elif _frac_len(text, ".") != 3:
                dot_votes += 1
    return "," if comma_votes > dot_votes else "."


def parse_amount(value: object, decimal: str = ".") -> Decimal | None:
    """El importe como `Decimal` exacto, o None si no es un número razonable (NaN, infinito, texto, absurdo)."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float, Decimal)):
        try:
            number = Decimal(repr(value)) if isinstance(value, float) else Decimal(value)
        except InvalidOperation:
            return None
        return number if _acceptable(number) else None

    text = _CURRENCY.sub("", _as_text(value)).strip()
    negative = False
    if text.startswith("(") and text.endswith(")"):  # contabilidad: (500) = -500
        negative, text = True, text[1:-1].strip()
    if text.endswith("-"):
        negative, text = True, text[:-1].strip()
    if text and text[0] in "+-":  # (cuidado: `"" in "+-"` es True en Python)
        negative ^= text[0] == "-"
        text = text[1:].strip()
    if not text or not _DIGITS_AND_SEPARATORS.match(text):
        return None
    text = re.sub(r"[\s']", "", text)
    thousands = "," if decimal == "." else "."
    if thousands in text:
        # Los millares van de tres en tres: «1,234,567» sí; «1,5,5» o «12,34,567» no (casi seguro un error de captura).
        grouped = rf"[0-9]{{1,3}}(?:{re.escape(thousands)}[0-9]{{3}})+(?:{re.escape(decimal)}[0-9]+)?"
        if not re.fullmatch(grouped, text):
            return None
        text = text.replace(thousands, "")
    text = text.replace(decimal, ".")
    if not re.fullmatch(r"[0-9]+(\.[0-9]+)?", text):
        return None
    number = Decimal(text)
    number = -number if negative else number
    return number if _acceptable(number) else None


def _acceptable(number: Decimal) -> bool:
    return number.is_finite() and abs(number) <= MAX_ABS_AMOUNT and -number.as_tuple().exponent <= MAX_DECIMALS


def money(number: Decimal) -> str:
    """Texto decimal exacto con al menos 2 decimales (`10` → `10.00`, `-0.5` → `-0.50`). Nunca notación científica."""
    text = format(number, "f")
    whole, _, frac = text.partition(".")
    return f"{whole}.{frac.ljust(2, '0')}"
