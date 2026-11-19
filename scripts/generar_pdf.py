#!/usr/bin/env python3
"""Genera un REPORTE DE VENTAS en PDF del café ficticio, con semilla fija, para probar la lectura de PDF (v0.12).

    python3 scripts/generar_pdf.py             # escribe en datos-ejemplo/

Todo es inventado. El PDF se arma byte a byte con el mismo generador de las pruebas del worker
(`worker/tests/pdf_maker.py`, solo biblioteca estándar): así hay un solo lugar donde se escribe un PDF a mano.
Imita lo que exporta un punto de venta: un título, la tabla de ventas partida en tres páginas (las dos últimas repiten
el encabezado) y al final una tabla de totales con OTRO número de columnas, que Atalaya no mezcla: la cuenta aparte.

Salida (en `datos-ejemplo/`):
  reporte-ventas.pdf    80 ventas de marzo de 2026 en 3 páginas, más una tabla de totales de 3 filas
  manifiesto-pdf.json   total esperado, filas y descartes, para compararlos contra lo que Atalaya encuentre
"""

import json
import random
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker" / "tests"))
from pdf_maker import make_pdf  # noqa: E402 - después de poner su carpeta en la ruta

SEED = 20261120
OUT = ROOT / "datos-ejemplo"
HEADER = ["Fecha", "Ticket", "Producto", "Cantidad", "Importe"]
PRODUCTS = [("Latte", Decimal("52.00")), ("Americano", Decimal("38.00")), ("Croissant", Decimal("42.00")), ("Café de olla", Decimal("35.00"))]
PAGES = (28, 28, 24)  # filas de venta por página: 80 en total


def main() -> None:
    rng = random.Random(SEED)  # noqa: S311 - datos de ejemplo, no criptografía
    sales, total = [], Decimal(0)
    for n in range(sum(PAGES)):
        name, price = rng.choice(PRODUCTS)
        qty = rng.randint(1, 3)
        amount = price * qty
        total += amount
        sales.append([f"2026-03-{1 + n * 30 // sum(PAGES):02d}", f"T-{1001 + n}", name, str(qty), f"{amount:.2f}"])

    pages, start = [], 0
    for i, count in enumerate(PAGES):
        rows = sales[start : start + count]
        start += count
        blocks = [("text", "Café La Atalaya (ficticio) - Reporte de ventas, marzo 2026")] if i == 0 else []
        blocks.append(("table", [HEADER, *rows]))  # cada página repite el encabezado, como un reporte real
        pages.append(blocks)
    iva = (total * Decimal("0.16") / Decimal("1.16")).quantize(Decimal("0.01"))
    totals = [["Total", f"{total:.2f}"], ["IVA incluido", f"{iva:.2f}"], ["Tickets", str(len(sales))]]
    pages[-1].append(("table", totals))  # otra anchura (2 columnas): Atalaya la descarta contada

    OUT.mkdir(exist_ok=True)
    (OUT / "reporte-ventas.pdf").write_bytes(make_pdf(pages))
    manifest = {
        "archivo": "reporte-ventas.pdf",
        "mapeo": {"date": 0, "orderId": 1, "product": 2, "quantity": 3, "amount": 4},
        "filasLeidas": len(sales) + len(totals),
        "filasConservadas": len(sales),
        "tablaDescartada": {"codigo": "table_skipped", "filas": len(totals), "pagina": len(PAGES)},
        "totalEsperado": f"{total:.2f}",
    }
    (OUT / "manifiesto-pdf.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"reporte-ventas.pdf: {len(sales)} ventas en {len(PAGES)} páginas, total {total:.2f}")


if __name__ == "__main__":
    main()
