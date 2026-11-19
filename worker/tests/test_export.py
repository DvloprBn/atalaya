import csv
from datetime import date
from decimal import Decimal

import pytest

from atalaya_worker.cleaner import CleanRow
from atalaya_worker.export import safe_cell, write_clean, write_report

FORMULAS = [
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(A1)",
    '=HYPERLINK("http://evil","x")',
    "=cmd|' /C calc'!A0",
    "\t=1+1",
    "\r=1+1",
    " =1+1",
    "\n=1+1",
    " =1+1",
]


@pytest.mark.parametrize("text", FORMULAS)
def test_every_formula_shape_gets_a_quote(text):
    assert safe_cell(text).startswith("'")


@pytest.mark.parametrize("text", ["pan", "", "Café con leche", "a=b", "x-1", "100% real", "'ya con comilla"])
def test_normal_text_is_left_alone(text):
    assert safe_cell(text) == text


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return list(csv.reader(handle))


def test_clean_csv_neutralizes_text_but_not_typed_columns(tmp_path):
    rows = [
        CleanRow(date(2026, 1, 5), Decimal("-50.5"), Decimal("2"), '=HYPERLINK("x")', "@norte", "+99"),
        CleanRow(date(2026, 1, 6), Decimal("10"), None, "pan", None, None),
    ]
    path = write_clean(str(tmp_path), "a" * 32, rows, {"quantity", "product", "branch", "orderId"})
    assert path.name == "a" * 32 + ".clean.csv"
    assert path.read_bytes().startswith(b"\xef\xbb\xbf")  # BOM: Excel en español lo abre bien
    table = read(path)
    assert table[0] == ["fecha", "importe", "cantidad", "producto", "sucursal", "pedido"]
    # El importe NEGATIVO legítimo no se toca: es un número, no un texto.
    assert table[1] == ["2026-01-05", "-50.50", "2", '\'=HYPERLINK("x")', "'@norte", "'+99"]
    assert table[2] == ["2026-01-06", "10.00", "", "pan", "", ""]


def test_only_mapped_columns_are_written(tmp_path):
    path = write_clean(str(tmp_path), "b" * 32, [CleanRow(date(2026, 1, 5), Decimal(1), None, None, None, None)], set())
    assert read(path) == [["fecha", "importe"], ["2026-01-05", "1.00"]]


def test_report_csv_neutralizes_the_examples_taken_from_the_file(tmp_path):
    report = {
        "rowsRead": 3, "rowsKept": 1, "rowsDropped": 2, "dateFrom": "2026-01-01", "dateTo": "2026-01-01",
        "totalAmount": "-5.00",
        "columns": [{"field": "date", "filled": 3, "invalid": 2}],
        "issues": [
            {
                "code": "bad_date", "count": 2, "dropped": True,
                "examples": [{"row": 2, "value": "=cmd|' /C calc'!A0"}, {"row": 3, "value": "ayer"}],
            }
        ],
    }  # fmt: skip
    table = read(write_report(str(tmp_path), "c" * 32, report))
    assert table[0] == ["seccion", "clave", "valor", "descartada", "fila", "ejemplo"]
    assert ["resumen", "totalAmount", "-5.00", "", "", ""] in table  # el total negativo es dato tipado: intacto
    assert ["problema", "bad_date", "2", "sí", "", ""] in table
    assert ["ejemplo", "bad_date", "", "", "2", "'=cmd|' /C calc'!A0"] in table
    assert ["ejemplo", "bad_date", "", "", "3", "ayer"] in table
    # Ninguna celda del archivo, en ninguna columna, queda con una fórmula suelta.
    assert not [c for row in table[1:] for c in row if c.lstrip().startswith(("=", "+", "@"))]


def test_files_are_written_atomically_no_temp_left(tmp_path):
    write_clean(str(tmp_path), "d" * 32, [CleanRow(date(2026, 1, 5), Decimal(1), None, None, None, None)], set())
    assert [p.name for p in tmp_path.iterdir()] == ["d" * 32 + ".clean.csv"]
