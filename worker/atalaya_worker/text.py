"""Texto que viene de un archivo ajeno = DATO hostil. Aquí se vuelve inofensivo antes de guardarlo o mostrarlo."""

import re
import unicodedata

# Control (tabulador, saltos de línea, nulos...) → espacio: en un nombre o un ejemplo no tienen sentido.
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")
# Invisibles que cambian lo que se VE sin cambiar lo que se guarda (cero ancho, inversión de dirección U+202E, BOM).
_INVISIBLE = re.compile(r"[​-‏ -‮⁠-⁯﻿]")


def cell_text(value: object) -> str:
    """Una celda como texto: sin «None», y un número entero de Excel (1001.0) como «1001»."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def clean_text(value: object, limit: int) -> str:
    """Normalizado, sin control ni invisibles, espacios colapsados y recortado a `limit` caracteres."""
    text = unicodedata.normalize("NFC", cell_text(value))
    text = _INVISIBLE.sub("", _CONTROL.sub(" ", text))
    return " ".join(text.split())[:limit]
