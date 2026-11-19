from datetime import date, datetime
from decimal import Decimal

import pytest

from atalaya_worker.text import clean_text
from atalaya_worker.values import decide_date_order, decide_decimal_separator, money, parse_amount, parse_date


def amount(text, sep=None):
    return parse_amount(text, sep or decide_decimal_separator([text]))


class TestDates:
    def test_iso_is_unambiguous(self):
        assert parse_date("2026-04-03") == (date(2026, 4, 3), False)
        assert parse_date("2026/04/03 10:30:00") == (date(2026, 4, 3), False)

    def test_slash_dates_follow_the_order_and_flag_ambiguity(self):
        assert parse_date("03/04/2026", "dmy") == (date(2026, 4, 3), True)
        assert parse_date("03/04/2026", "mdy") == (date(2026, 3, 4), True)
        assert parse_date("25/12/2026", "dmy") == (date(2026, 12, 25), False)  # solo puede ser día/mes
        assert parse_date("5/5/2026", "dmy") == (date(2026, 5, 5), False)  # iguales: no hay ambigüedad

    def test_two_digit_year_and_excel_dates(self):
        assert parse_date("1/2/26", "dmy")[0] == date(2026, 2, 1)
        assert parse_date(datetime(2026, 1, 5, 9, 0)) == (date(2026, 1, 5), False)  # una celda de fecha de Excel
        assert parse_date(date(2026, 1, 5)) == (date(2026, 1, 5), False)

    @pytest.mark.parametrize(
        "bad", ["", "ayer", "31/02/2026", "32/01/2026", "1/1/1850", "13/13/2026", "2026-13-01", "٠٣/٠٤/٢٠٢٦", "1/1/226"]
    )
    def test_invalid_dates_are_none(self, bad):
        assert parse_date(bad)[0] is None

    def test_order_is_decided_by_the_whole_column(self):
        assert decide_date_order(["03/04/2026", "25/12/2026"]) == ("dmy", True)  # un 25 solo puede ser día
        assert decide_date_order(["03/04/2026", "12/25/2026"]) == ("mdy", True)
        assert decide_date_order(["03/04/2026", "05/06/2026"]) == ("dmy", False)  # sin pistas: México, y se AVISA
        assert decide_date_order(["25/12/2026", "12/25/2026"]) == ("dmy", True)  # pistas que chocan: dmy

    def test_iso_dates_give_no_evidence(self):
        assert decide_date_order(["2026-04-03"]) == ("dmy", False)


class TestAmounts:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("$1,234.50", "1234.50"), ("1.234,50", "1234.50"), ("MXN 1 234,5", "1234.5"), ("(500)", "-500"),
            ("500-", "-500"), ("-50.00", "-50.00"), ("+7", "7"), ("12,5", "12.5"), ("1,234,567.89", "1234567.89"),
            ("1.234.567", "1234567"), ("0", "0"), ("USD 99.99", "99.99"),
        ],
    )  # fmt: skip
    def test_formats_people_use(self, text, expected):
        assert amount(text) == Decimal(expected)

    @pytest.mark.parametrize(
        "bad", ["", " ", "-", "abc", "NaN", "Infinity", "1e5", "1,5,5", "12,34,567", "١٢٣", "1.2.3,4", "0.1234567", "9" * 14]
    )
    def test_not_numbers_or_not_reasonable_are_none(self, bad):
        assert amount(bad) is None

    def test_typed_cells_and_floats_are_exact_decimals(self):
        assert parse_amount(10.1) == Decimal("10.1")  # no 10.0999999...
        assert parse_amount(0.1) + parse_amount(0.2) == Decimal("0.3")  # con float sería 0.30000000000000004
        assert parse_amount(10) == Decimal(10)

    @pytest.mark.parametrize("bad", [None, True, float("nan"), float("inf"), 10**13])
    def test_untyped_or_absurd_values_are_none(self, bad):
        assert parse_amount(bad) is None

    def test_separator_is_decided_by_votes(self):
        assert decide_decimal_separator(["1,234.50", "12.5"]) == "."
        assert decide_decimal_separator(["1.234,50", "12,5"]) == ","
        assert decide_decimal_separator(["1,234"]) == "."  # ambiguo: se queda el punto (México)
        assert decide_decimal_separator(["abc", ""]) == "."

    def test_money_has_at_least_two_decimals_and_never_scientific(self):
        assert money(Decimal("10")) == "10.00"
        assert money(Decimal("-0.5")) == "-0.50"
        assert money(Decimal("1E+3")) == "1000.00"
        assert money(Decimal("1234.567")) == "1234.567"


class TestCleanText:
    def test_control_and_invisible_characters_are_removed(self):
        assert clean_text("a\u0000b\tc\nd", 50) == "a b c d"
        assert clean_text("pass‮wd", 50) == "passwd"  # la inversión de dirección engaña a quien lee
        assert clean_text("a​b﻿c", 50) == "abc"

    def test_spaces_collapse_and_length_is_cut(self):
        assert clean_text("  a    b  ", 50) == "a b"
        assert clean_text("x" * 300, 40) == "x" * 40
        assert clean_text(None, 10) == ""
        assert clean_text(1001.0, 10) == "1001"  # un entero que Excel guardó como 1001.0
