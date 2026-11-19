from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from atalaya_worker import cleaner
from atalaya_worker.quant import cents, median, percent, ratio_percent
from atalaya_worker.tabular import Table
from atalaya_worker.tz import TIMEZONE_NAME, business_today

HEADER = ["fecha", "total"]


class TestBusinessToday:
    def test_between_18_and_24_in_mexico_utc_is_already_tomorrow_but_today_is_not(self):
        # 2026-11-19 02:30 UTC = 2026-11-18 20:30 en México: «hoy» sigue siendo el 18.
        assert business_today(datetime(2026, 11, 19, 2, 30, tzinfo=UTC)) == date(2026, 11, 18)

    def test_the_day_changes_at_midnight_mexico_time_not_at_midnight_utc(self):
        assert business_today(datetime(2026, 11, 19, 5, 59, 59, tzinfo=UTC)) == date(2026, 11, 18)  # 23:59:59 en México
        assert business_today(datetime(2026, 11, 19, 6, 0, 0, tzinfo=UTC)) == date(2026, 11, 19)  # 00:00:00 en México

    def test_it_converts_from_any_zone(self):
        tokyo = timezone(timedelta(hours=9))
        assert business_today(datetime(2026, 11, 19, 10, 0, tzinfo=tokyo)) == date(2026, 11, 18)  # 01:00 UTC = 19:00 del 18

    def test_a_naive_datetime_is_refused_not_guessed(self):
        with pytest.raises(ValueError, match="zona horaria"):
            business_today(datetime(2026, 11, 19, 2, 30))

    def test_the_zone_is_the_one_the_contract_names(self):
        assert TIMEZONE_NAME == "America/Mexico_City"


class TestFutureDatesUseTheBusinessDay:
    def run(self, monkeypatch, rows, today):
        monkeypatch.setattr(cleaner, "business_today", lambda: today)
        table = Table(HEADER, iter([(i, list(r)) for i, r in enumerate(rows, start=2)]))
        return cleaner.clean(table, {"date": 0, "amount": 1})  # sin `today`: lo decide la zona del negocio

    def test_one_day_of_slack_and_not_two(self, monkeypatch):
        today = date(2026, 11, 18)  # en UTC ya sería el 19 (de 18:00 a 24:00 en México)
        kept, report = self.run(monkeypatch, [["2026-11-18", "10"], ["2026-11-19", "10"], ["2026-11-20", "10"]], today)
        assert [r.date.isoformat() for r in kept] == ["2026-11-18", "2026-11-19"]
        future = next(i for i in report["issues"] if i["code"] == "future_date")
        assert future["count"] == 1 and future["examples"][0]["value"] == "2026-11-20"

    def test_a_sale_from_today_is_never_dropped_as_future(self, monkeypatch):
        kept, report = self.run(monkeypatch, [["2026-11-18", "10"], ["2026-11-01", "5"]], date(2026, 11, 18))
        assert len(kept) == 2 and not [i for i in report["issues"] if i["code"] == "future_date"]


class TestQuantize:
    @pytest.mark.parametrize(
        ("value", "text"),
        [("0", "0.00"), ("10", "10.00"), ("1234.5", "1234.50"), ("0.005", "0.01"), ("0.004", "0.00"), ("-0.004", "0.00"),
         ("-0.005", "-0.01"), ("2.675", "2.68"), ("1E+3", "1000.00"), ("-1234.567", "-1234.57")],
    )  # fmt: skip
    def test_cents_rounds_half_up_once_and_never_prints_negative_zero(self, value, text):
        assert cents(Decimal(value)) == text  # 2.675 → 2.68 (en flotante se redondearía a 2.67)

    @pytest.mark.parametrize(
        ("value", "text"),
        [("0", "0.0"), ("12.5", "12.5"), ("12.45", "12.5"), ("-0.04", "0.0"), ("100", "100.0"), ("-33.35", "-33.4")],
    )
    def test_percent_has_exactly_one_decimal_and_no_negative_zero(self, value, text):
        assert percent(Decimal(value)) == text

    def test_ratio_percent_against_nothing_is_none(self):
        assert ratio_percent(Decimal(5), Decimal(0)) is None
        assert ratio_percent(Decimal(1), Decimal(3)) == "33.3"

    def test_median(self):
        assert median([Decimal(3), Decimal(1), Decimal(2)]) == Decimal(2)
        assert median([Decimal(4), Decimal(1), Decimal(2), Decimal(3)]) == Decimal("2.5")
        assert median([Decimal(7)]) == Decimal(7)
