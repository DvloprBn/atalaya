"""Los dos CSV que se entregan. Aquí vive el ÚNICO sanitizador anti inyección de fórmulas de todo el sistema.

El ataque: una celda de texto que empieza con `=`, `+`, `-` o `@` (p. ej. `=HYPERLINK(...)` o `=cmd|...`) se EJECUTA
cuando alguien abre el CSV en Excel o Calc. Los datos vienen de un archivo ajeno, así que cualquier texto puede ser
un ataque. La defensa: a todo texto peligroso se le antepone una comilla simple (`'`), que la hoja de cálculo toma por
«esto es texto». Los importes, cantidades y fechas NO pasan por aquí: salen tipados (un `-50.00` legítimo no se rompe).
"""

import csv
import os
from decimal import Decimal
from pathlib import Path

from .cleaner import CleanRow
from .values import money

_DANGEROUS_START = ("=", "+", "-", "@", "\t", "\r")
# Algunas hojas ignoran estos caracteres al principio antes de decidir si es fórmula: se miran DESPUÉS de quitarlos.
_IGNORED_LEADING = " \t\r\n\x00\xa0"


def safe_cell(text: str) -> str:
    return "'" + text if text.lstrip(_IGNORED_LEADING).startswith(_DANGEROUS_START) else text


def _plain(number: Decimal) -> str:
    return format(number, "f")


def _write(path: Path, header: list[str], rows: list[list[str]]) -> None:
    """Escritura atómica (archivo temporal + renombrar): nadie descarga un CSV a medias. UTF-8 con BOM: Excel lo abre bien."""
    temporary = path.with_name(path.name + ".tmp")
    with open(temporary, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\r\n")
        writer.writerow(header)
        writer.writerows(rows)
    os.replace(temporary, path)


def write_clean(folder: str, key: str, rows: list[CleanRow], mapped: set[str]) -> Path:
    """Los datos limpios: fecha e importe siempre; lo demás, solo si la persona lo mapeó."""
    columns = [("fecha", "date"), ("importe", "amount")]
    columns += [
        (n, f)
        for n, f in (("cantidad", "quantity"), ("producto", "product"), ("sucursal", "branch"), ("pedido", "orderId"))
        if f in mapped
    ]
    body = []
    for row in rows:
        values = {
            "date": row.date.isoformat(),  # tipados: salen tal cual
            "amount": money(row.amount),
            "quantity": _plain(row.quantity) if row.quantity is not None else "",
            "product": safe_cell(row.product or ""),  # texto: lo único que se sanea
            "branch": safe_cell(row.branch or ""),
            "orderId": safe_cell(row.order_id or ""),
        }
        body.append([values[field] for _, field in columns])
    path = Path(folder) / f"{key}.clean.csv"
    _write(path, [name for name, _ in columns], body)
    return path


def write_report(folder: str, key: str, report: dict) -> Path:
    """El informe de calidad como CSV: una fila por dato (resumen, columna, problema o ejemplo)."""
    body: list[list[str]] = []
    for name in ("rowsRead", "rowsKept", "rowsDropped", "dateFrom", "dateTo", "totalAmount"):
        body.append(["resumen", name, str(report[name]), "", "", ""])
    for column in report["columns"]:
        body.append(["columna", column["field"], str(column["filled"]), str(column["invalid"]), "", ""])
    for issue in report["issues"]:
        body.append(["problema", issue["code"], str(issue["count"]), "sí" if issue["dropped"] else "no", "", ""])
        for example in issue["examples"]:
            # El valor de un ejemplo es TEXTO DEL ARCHIVO: puede ser un ataque, así que se sanea como cualquier otro.
            body.append(["ejemplo", issue["code"], "", "", str(example["row"]), safe_cell(example["value"])])
    path = Path(folder) / f"{key}.report.csv"
    _write(path, ["seccion", "clave", "valor", "descartada", "fila", "ejemplo"], body)
    return path
