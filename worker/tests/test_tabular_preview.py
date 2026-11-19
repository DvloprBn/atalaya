import csv
import io
from datetime import date, datetime

import pytest
from openpyxl import Workbook

from atalaya_worker.failure import AnalysisFail
from atalaya_worker.preview import build_preview
from atalaya_worker.tabular import read_table


def xlsx(*sheets):
    """Un .xlsx real hecho con openpyxl; cada hoja es una lista de filas."""
    book = Workbook()
    book.remove(book.active)
    for index, rows in enumerate(sheets):
        sheet = book.create_sheet(f"Hoja{index + 1}")
        for row in rows:
            sheet.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def csv_bytes(text):
    return text.encode("utf-8")


def csv_from(*rows):
    """Un CSV válido (con las comillas bien escapadas) a partir de filas."""
    out = io.StringIO()
    csv.writer(out).writerows(rows)
    return out.getvalue().encode("utf-8")


class TestReading:
    def test_csv_with_any_of_the_three_delimiters(self):
        for delimiter in (",", ";", "\t"):
            table = read_table(csv_bytes(f"fecha{delimiter}total\n2026-01-01{delimiter}10\n"), "csv")
            assert table.header == ["fecha", "total"]
            assert list(table.rows) == [(2, ["2026-01-01", "10"])]

    def test_csv_with_leading_blank_lines_and_a_ragged_row(self):
        table = read_table(csv_bytes("\n\nfecha,total,extra\n2026-01-01\n2026-01-02,5,x,sobra\n"), "csv")
        assert table.header == ["fecha", "total", "extra"]
        assert [cells for _, cells in table.rows] == [["2026-01-01", None, None], ["2026-01-02", "5", "x"]]  # mismo ancho

    def test_xlsx_values_keep_their_types(self):
        table = read_table(xlsx([["fecha", "total"], [date(2026, 1, 5), 10.5]]), "xlsx")
        ((_, cells),) = list(table.rows)
        assert cells == [datetime(2026, 1, 5), 10.5]

    def test_xlsx_skips_empty_sheets_and_empty_trailing_columns(self):
        table = read_table(xlsx([], [["a", "b", None, None], [1, 2]]), "xlsx")
        assert table.header == ["a", "b"]

    @pytest.mark.parametrize(
        ("data", "kind", "reason"),
        [
            (b"", "csv", "no_header"),
            (b"\n\n", "csv", "no_header"),
            (b"solo\n1\n2\n", "csv", "too_few_columns"),
            (b"a,b\n\xff\xfe\n", "csv", "unreadable"),
            (b'a,b\n"sin cerrar,1\n', "csv", "unreadable"),
            (b"PK\x03\x04 no soy un xlsx", "xlsx", "unreadable"),
            (b"", "xlsx", "unreadable"),
            (b"x", "pdf", "unreadable"),
        ],
    )
    def test_unreadable_files_fail_with_a_closed_reason(self, data, kind, reason):
        with pytest.raises(AnalysisFail) as info:
            read_table(data, kind)
        assert info.value.reason == reason

    def test_an_empty_workbook_has_no_header(self):
        with pytest.raises(AnalysisFail) as info:
            read_table(xlsx([]), "xlsx")
        assert info.value.reason == "no_header"

    def test_formulas_are_read_as_values_never_evaluated(self):
        # data_only=True: de una celda con fórmula solo se lee el último valor calculado (aquí no hay: None).
        table = read_table(xlsx([["a", "b"], ["=1+1", '=HYPERLINK("x")']]), "xlsx")
        ((_, cells),) = list(table.rows)
        assert cells == [None, None]


class TestPreview:
    def test_suggests_by_name_ignoring_accents_case_and_punctuation(self):
        header = ["Fecha de Venta", "TOTAL $", "Cantidad", "Artículo", "Sucursal", "Folio"]
        table = read_table(csv_from(header, ["2026-01-01", "10", "1", "pan", "norte", "A1"]), "csv")
        preview = build_preview(table)
        # «TOTAL $» no coincide con una palabra exacta («total»), pero SÍ se encuentra por contenido (todo son números).
        assert preview["suggested"] == {"date": 0, "amount": 1, "quantity": 2, "product": 3, "branch": 4, "orderId": 5}
        assert preview["rowCount"] == 1

    def test_falls_back_to_content_for_date_and_amount(self):
        rows = "\n".join(f"{n},2026-01-{n:02d},{n * 7}.50" for n in range(1, 10))
        preview = build_preview(read_table(csv_bytes("col a,col b,col c\n" + rows + "\n"), "csv"))
        assert preview["suggested"]["date"] == 1
        assert preview["suggested"]["amount"] in (0, 2)  # la que sea número y no sea la fecha

    def test_samples_and_names_are_short_clean_text(self):
        evil = '=HYPERLINK("x")‮' + "x" * 100
        table = read_table(csv_from([evil, "b"], [evil, "2"]), "csv")
        preview = build_preview(table)
        assert len(preview["columns"][0]["name"]) <= 60 and "‮" not in preview["columns"][0]["name"]
        assert all(len(s) <= 40 for s in preview["columns"][0]["samples"])

    def test_at_most_five_samples_and_blank_rows_are_not_counted(self):
        body = "\n".join(f"2026-01-01,{n}" for n in range(20)) + "\n,\n,\n"
        preview = build_preview(read_table(csv_bytes("fecha,total\n" + body), "csv"))
        assert preview["rowCount"] == 20
        assert len(preview["columns"][1]["samples"]) == 5
        assert [c["index"] for c in preview["columns"]] == [0, 1]
