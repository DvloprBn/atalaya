from datetime import date
from decimal import Decimal

import pytest

from atalaya_worker.cleaner import DROPPING, check_mapping, clean
from atalaya_worker.failure import AnalysisFail
from atalaya_worker.tabular import Table

TODAY = date(2026, 11, 18)
HEADER = ["fecha", "total", "cant", "producto", "sucursal", "folio"]
MAPPING = {"date": 0, "amount": 1, "quantity": 2, "product": 3, "branch": 4, "orderId": 5}


def table(rows, header=HEADER):
    return Table(list(header), iter([(i, list(r)) for i, r in enumerate(rows, start=2)]))


def run(rows, mapping=None, header=HEADER):
    return clean(table(rows, header), mapping or MAPPING, today=TODAY)


def issue(report, code):
    return next((i for i in report["issues"] if i["code"] == code), None)


def good(n=1, **over):
    row = [f"2026-01-{n:02d}", "10.00", "1", "pan", "norte", f"A{n}"]
    return [over.get(h, v) for h, v in zip(HEADER, row, strict=True)]


class TestReport:
    def test_a_clean_file_has_no_issues_and_the_numbers_add_up(self):
        kept, report = run([good(1), good(2), good(3)])
        assert report["rowsRead"] == 3 and report["rowsKept"] == 3 and report["rowsDropped"] == 0
        assert report["issues"] == []
        assert report["totalAmount"] == "30.00"
        assert (report["dateFrom"], report["dateTo"]) == ("2026-01-01", "2026-01-03")
        assert [c["field"] for c in report["columns"]] == ["date", "amount", "quantity", "product", "branch", "orderId"]
        assert len(kept) == 3

    def test_read_equals_kept_plus_dropped_even_with_a_mess(self):
        rows = [
            good(1),
            ["", "", "", "", "", ""],
            good(1),
            ["mañana", "5", "", "", "", ""],
            ["2026-02-01", "x", "", "", "", ""],
            good(2),
        ]
        _, report = run(rows)
        assert report["rowsRead"] == 6
        assert report["rowsKept"] + report["rowsDropped"] == report["rowsRead"]
        assert report["rowsKept"] == 2

    def test_total_is_exact_decimal(self):
        _, report = run([good(1, total="0.10"), good(2, total="0.20")])
        assert report["totalAmount"] == "0.30"  # con float: 0.30000000000000004


class TestEveryDropIsCounted:
    @pytest.mark.parametrize(
        ("row", "code"),
        [
            (["", "", "", "", "", ""], "blank_row"),
            (good(1, fecha="ayer"), "bad_date"),
            (good(1, fecha=""), "bad_date"),
            (good(1, fecha="2030-01-01"), "future_date"),
            (good(1, total="mucho"), "bad_amount"),
            (good(1, total=""), "bad_amount"),
            (good(1, cant="dos"), "bad_quantity"),
        ],
    )
    def test_dropped_rows_say_why(self, row, code):
        _, report = run([good(2), row])
        found = issue(report, code)
        assert found and found["count"] == 1 and found["dropped"] is True
        assert found["examples"][0]["row"] == 3  # la fila del archivo (el encabezado es la 1, la primera de datos la 2)
        assert code in DROPPING

    def test_a_duplicate_keeps_the_first(self):
        kept, report = run([good(1), good(2), good(1)])
        assert len(kept) == 2
        assert issue(report, "duplicate_row")["count"] == 1

    def test_the_same_order_in_several_lines_is_NOT_a_duplicate(self):
        kept, report = run([good(1, producto="pan", folio="A1"), good(1, producto="leche", folio="A1")])
        assert len(kept) == 2 and issue(report, "duplicate_row") is None

    def test_a_row_drops_for_only_one_reason(self):
        _, report = run([good(2), ["ayer", "mucho", "dos", "x", "y", "z"]])
        assert [i["code"] for i in report["issues"]] == ["bad_date"]


class TestWarningsKeepTheRow:
    def test_negative_and_zero_amounts_warn_but_stay(self):
        kept, report = run([good(1, total="-5.00"), good(2, total="0")])
        assert len(kept) == 2
        assert issue(report, "negative_amount")["dropped"] is False
        assert issue(report, "zero_amount")["count"] == 1
        assert report["totalAmount"] == "-5.00"

    def test_ambiguous_dates_warn_only_when_the_order_was_a_guess(self):
        rows = [good(1, fecha="03/04/2026"), good(2, fecha="05/06/2026")]
        _, guessed = run(rows)
        assert issue(guessed, "ambiguous_dates")["count"] == 2
        _, stated = run(rows, {**MAPPING, "dateOrder": "dmy"})
        assert issue(stated, "ambiguous_dates") is None  # la persona lo dijo: no hay nada que avisar
        _, evidence = run([*rows, good(3, fecha="25/12/2026")])
        assert issue(evidence, "ambiguous_dates") is None  # un 25 prueba que es día/mes

    def test_the_order_option_changes_the_result(self):
        kept, _ = run([good(1, fecha="03/04/2026")], {**MAPPING, "dateOrder": "mdy"})
        assert kept[0].date == date(2026, 3, 4)

    def test_text_fixes_are_counted(self):
        _, report = run([good(1, producto="  pan   dulce "), good(2, producto="x" * 300)])
        assert issue(report, "text_trimmed")["count"] == 1
        assert issue(report, "text_truncated")["count"] == 1
        assert issue(report, "text_truncated")["dropped"] is False


class TestFormats:
    def test_decimal_comma_files(self):
        kept, report = run([good(1, total="1.234,50"), good(2, total="12,5")])
        assert [r.amount for r in kept] == [Decimal("1234.50"), Decimal("12.5")]
        assert report["totalAmount"] == "1247.00"

    def test_explicit_separator_wins_over_the_data(self):
        kept, _ = run([good(1, total="1,234")], {**MAPPING, "decimalSeparator": ","})
        assert kept[0].amount == Decimal("1.234")

    def test_only_date_and_amount_are_required(self):
        kept, report = run([["2026-01-01", "5", "x", "y"]], {"date": 0, "amount": 1}, header=["a", "b", "c", "d"])
        assert kept[0].product is None and [c["field"] for c in report["columns"]] == ["date", "amount"]

    def test_hostile_text_is_neutralized_in_values_and_examples(self):
        kept, report = run([good(1, producto='=HYPERLINK("http://x")‮'), good(2, fecha="\u0000\n<script>")])
        assert "‮" not in kept[0].product
        example = issue(report, "bad_date")["examples"][0]["value"]
        assert "\u0000" not in example and "\n" not in example and len(example) <= 40


class TestFailures:
    def test_nothing_left_when_every_row_is_dropped(self):
        with pytest.raises(AnalysisFail) as info:
            run([["ayer", "x", "", "", "", ""]])
        assert info.value.reason == "nothing_left"

    @pytest.mark.parametrize(
        "mapping",
        [
            {"date": 0},
            {"amount": 1},
            {"date": 1, "amount": 1},
            {"date": 0, "amount": 99},
            {"date": -1, "amount": 1},
            {"date": "0", "amount": 1},
            {"date": 0, "amount": 1, "product": 6},
        ],
    )
    def test_the_worker_does_not_trust_the_mapping(self, mapping):
        with pytest.raises(AnalysisFail) as info:
            check_mapping(mapping, 6)
        assert info.value.reason == "mapping_invalid"
