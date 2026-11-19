from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from atalaya_worker.anomalies import build_anomalies
from atalaya_worker.cleaner import CleanRow, clean
from atalaya_worker.forecast import build_forecast
from atalaya_worker.indicators import build_branches, build_indicators, build_monthly, build_weekdays
from atalaya_worker.insights import build_insights
from atalaya_worker.pareto import build_pareto
from atalaya_worker.tabular import Table

D = Decimal
MONDAY = date(2026, 1, 5)
PATTERN = {1: 100, 2: 110, 3: 120, 4: 130, 5: 200, 6: 300}  # lunes … sábado; el domingo no se abre


def row(day, amount, product=None, branch=None, order=None, quantity=None):
    return CleanRow(day, D(str(amount)), quantity, product, branch, order)


def weekly(weeks, start=MONDAY, bump=None, noise=False):
    """Una fila por día abierto, con el patrón semanal; `bump` = {fecha: monto} sustituye un día; `noise` agrega ±5."""
    rows = []
    for n in range(weeks * 7):
        day = start + timedelta(days=n)
        base = PATTERN.get(day.isoweekday())
        if base is None:
            continue
        amount = (bump or {}).get(day, base + (((n * 37) % 11) - 5 if noise else 0))
        rows.append(row(day, amount))
    return rows


class TestIndicators:
    ROWS = [
        row(date(2026, 1, 5), "100.50", "pan", "norte", "A1"),
        row(date(2026, 1, 5), "50.00", "leche", "norte", "A2"),
        row(date(2026, 1, 6), "-20.00", "pan", "sur", "A3"),
        row(date(2026, 2, 3), "80.25", "pan", "sur", "A4"),
        row(date(2026, 2, 3), "19.75", "leche", "sur", "A4"),
    ]

    def test_totals_are_exact_and_returns_are_separate(self):
        out = build_indicators(self.ROWS)
        assert out["grossAmount"] == "250.50" and out["returnsAmount"] == "20.00" and out["netAmount"] == "230.50"
        assert out["rows"] == 5 and out["activeDays"] == 3
        assert out["averagePerActiveDay"] == "76.83"  # 230.50 / 3 = 76.8333… redondeado una sola vez

    def test_orders_and_ticket_only_when_the_column_exists(self):
        out = build_indicators(self.ROWS)
        assert out["orders"] == 4  # A1, A2, A3, A4 (A4 tiene dos líneas: un solo pedido)
        assert out["averageTicket"] == "57.63"  # 230.50 / 4 = 57.625 → .63 (mitad hacia arriba)
        bare = build_indicators([row(date(2026, 1, 5), 10), row(date(2026, 1, 6), 20)])
        assert bare["orders"] is None and bare["averageTicket"] is None

    def test_best_and_worst_day_break_ties_by_the_earliest(self):
        out = build_indicators(
            [row(date(2026, 1, 7), 50), row(date(2026, 1, 5), 50), row(date(2026, 1, 6), 10), row(date(2026, 1, 8), 10)]
        )
        assert out["bestDay"] == {"date": "2026-01-05", "amount": "50.00"}
        assert out["worstDay"] == {"date": "2026-01-06", "amount": "10.00"}

    def test_floats_never_get_involved(self):
        out = build_indicators([row(date(2026, 1, 5), "0.10"), row(date(2026, 1, 5), "0.20")])
        assert out["netAmount"] == "0.30"  # con float: 0.30000000000000004

    def test_monthly_has_the_change_against_the_previous_month_with_data(self):
        monthly = build_monthly(self.ROWS)
        assert monthly == [
            {"month": "2026-01", "amount": "130.50", "rows": 3, "changePercent": None},
            {"month": "2026-02", "amount": "100.00", "rows": 2, "changePercent": "-23.4"},  # (100 - 130.5) / 130.5
        ]

    def test_a_missing_month_is_compared_with_the_last_month_that_has_data_and_zero_has_no_change(self):
        rows = [row(date(2026, 1, 5), 100), row(date(2026, 4, 5), 150), row(date(2026, 5, 5), 50)]
        assert [m["changePercent"] for m in build_monthly(rows)] == [None, "50.0", "-66.7"]
        zero = [row(date(2026, 1, 5), 10), row(date(2026, 1, 6), -10), row(date(2026, 2, 5), 10)]
        assert build_monthly(zero)[1]["changePercent"] is None  # el mes anterior suma 0: no hay «cambio»

    def test_weekday_averages_are_over_days_with_data(self):
        out = build_weekdays(weekly(2))
        assert [(w["weekday"], w["average"], w["days"]) for w in out] == [
            (1, "100.00", 2), (2, "110.00", 2), (3, "120.00", 2), (4, "130.00", 2), (5, "200.00", 2), (6, "300.00", 2),
        ]  # fmt: skip

    def test_branches_are_the_largest_by_positive_net_with_their_share(self):
        # norte: 100.50 + 50.00 = 150.50 · sur: -20.00 + 80.25 + 19.75 = 80.00 · total positivo 230.50
        assert build_branches(self.ROWS) == [
            {"name": "norte", "amount": "150.50", "sharePercent": "65.3"},
            {"name": "sur", "amount": "80.00", "sharePercent": "34.7"},
        ]

    def test_branches_are_null_without_the_column_and_capped_at_ten(self):
        assert build_branches([row(date(2026, 1, 5), 10)]) is None
        many = [row(date(2026, 1, 5), 100 + n, branch=f"s{n:02d}") for n in range(15)]
        assert len(build_branches(many)) == 10


class TestPareto:
    ROWS = [
        row(date(2026, 1, 5), a, product=p)
        for p, a in [("pan", 400), ("pan", 200), ("leche", 300), ("té", 80), ("café", 20), ("bolsa", -10)]
    ]

    def test_classes_shares_and_cumulative_are_computed_on_exact_values(self):
        out = build_pareto(self.ROWS)
        assert [(i["name"], i["amount"], i["sharePercent"], i["cumulativePercent"], i["class"]) for i in out["items"]] == [
            ("pan", "600.00", "60.0", "60.0", "A"),
            ("leche", "300.00", "30.0", "90.0", "A"),  # lo acumulado ANTES (60) < 80
            ("té", "80.00", "8.0", "98.0", "B"),  # antes: 90, entre 80 y 95
            ("café", "20.00", "2.0", "100.0", "C"),  # antes: 98
        ]
        assert out["nonPositiveCount"] == 1 and out["otherCount"] == 0 and out["otherAmount"] == "0.00"

    def test_the_item_that_crosses_80_percent_is_still_class_a(self):
        rows = [row(date(2026, 1, 5), a, product=p) for p, a in [("a", 50), ("b", 40), ("c", 10)]]  # 50, 90, 100 acumulado
        assert [i["class"] for i in build_pareto(rows)["items"]] == ["A", "A", "B"]  # b cruza el 80 % (antes: 50) → A

    def test_only_the_top_20_are_listed_and_the_rest_are_counted_with_their_amount(self):
        rows = [row(date(2026, 1, 5), 1000 - n, product=f"p{n:02d}") for n in range(25)]
        out = build_pareto(rows)
        assert len(out["items"]) == 20 and out["otherCount"] == 5
        assert out["otherAmount"] == "4890.00"  # los 5 menores: 980 + 979 + 978 + 977 + 976

    def test_null_without_a_product_column_and_a_missing_name_is_grouped(self):
        assert build_pareto([row(date(2026, 1, 5), 10)]) is None
        mixed = build_pareto([row(date(2026, 1, 5), 10, product="pan"), row(date(2026, 1, 6), 5)])
        assert {i["name"] for i in mixed["items"]} == {"pan", "(sin nombre)"}

    def test_ties_are_broken_by_name_so_the_result_is_stable(self):
        rows = [row(date(2026, 1, 5), 10, product=n) for n in ["b", "c", "a"]]
        assert [i["name"] for i in build_pareto(rows)["items"]] == ["a", "b", "c"]


class TestAnomalies:
    SPIKE = date(2026, 2, 11)  # un miércoles

    def test_a_spike_is_flagged_against_its_own_weekday_and_nothing_else_is(self):
        out = build_anomalies(weekly(10, bump={self.SPIKE: 900}, noise=True))
        assert out["status"] == "ok"
        assert [(a["date"], a["amount"], a["direction"]) for a in out["items"]] == [("2026-02-11", "900.00", "high")]
        assert 110 <= Decimal(out["items"][0]["expected"]) <= 130  # lo normal de un miércoles, no el promedio general

    def test_a_drop_is_flagged_as_low(self):
        out = build_anomalies(weekly(10, bump={self.SPIKE: 5}, noise=True))
        assert [a["direction"] for a in out["items"]] == ["low"]

    def test_saturdays_are_not_anomalies_just_because_they_are_high(self):
        assert build_anomalies(weekly(10, noise=True))["items"] == []  # el sábado (300) es normal PARA un sábado

    def test_perfectly_regular_data_still_flags_a_real_outlier(self):
        out = build_anomalies(weekly(10, bump={self.SPIKE: 900}))  # sin ruido: la MAD es 0 y se usa la desviación media
        assert [a["date"] for a in out["items"]] == ["2026-02-11"]

    def test_steady_growth_is_not_an_anomaly(self):
        """Un negocio que crece NO debe marcar sus primeros meses como «bajos». (1,5 % por semana es exagerado a propósito:
        con eso el baseline GLOBAL se equivoca y el local no.)"""
        rows = []
        for n in range(70 * 7):
            day = MONDAY + timedelta(days=n)
            base = PATTERN.get(day.isoweekday())
            if base:
                rows.append(row(day, Decimal(base) * Decimal("1.015") ** (n // 7) + ((n * 37) % 11 - 5) * 3))
        assert build_anomalies(rows)["items"] == []  # con la mediana GLOBAL de cada día de la semana salían decenas

    def test_a_real_event_inside_a_growing_business_is_still_found(self):
        rows = []
        spike = MONDAY + timedelta(days=7 * 40 + 4)  # un viernes
        for n in range(70 * 7):
            day = MONDAY + timedelta(days=n)
            base = PATTERN.get(day.isoweekday())
            if base:
                amount = Decimal(base) * Decimal("1.015") ** (n // 7) + ((n * 37) % 11 - 5) * 3
                rows.append(row(day, amount * 3 if day == spike else amount))
        out = build_anomalies(rows)
        assert [a["date"] for a in out["items"]] == [spike.isoformat()]
        assert out["items"][0]["direction"] == "high"

    def test_expenses_spread_over_the_month_are_not_analyzed_by_weekday(self):
        """Renta el 1, nómina el 15 y fin de mes: casi todos los días no tienen gasto. Marcar «anomalías» ahí es ruido."""
        rows = []
        for month in range(1, 13):
            for day_of_month, amount in ((1, 18000), (15, 38000), (28, 38000)):
                rows.append(row(date(2026, month, day_of_month), amount))
        assert len(rows) >= 28
        assert build_anomalies(rows) == {"status": "insufficient_data", "items": []}

    def test_all_identical_means_nothing_to_flag_not_a_crash(self):
        assert build_anomalies(weekly(10)) == {"status": "ok", "items": []}

    def test_less_than_four_weeks_of_active_days_says_so_instead_of_inventing(self):
        assert build_anomalies(weekly(4)[:27]) == {"status": "insufficient_data", "items": []}
        assert build_anomalies(weekly(5))["status"] == "ok"  # 30 días activos

    def test_at_most_ten_and_the_strongest_first(self):
        bump = {MONDAY + timedelta(days=7 * k + 2): 1000 + 100 * k for k in range(1, 9)} | {
            MONDAY + timedelta(days=7 * k): 5000 for k in range(1, 4)
        }
        out = build_anomalies(weekly(12, bump=bump, noise=True))
        scores = [Decimal(a["score"]) for a in out["items"]]
        assert len(out["items"]) <= 10 and scores == sorted(scores, reverse=True)


class TestForecast:
    """`weekly(11)` son 77 días y el último con datos es el SÁBADO 2026-03-21 (el domingo no se abre): el pronóstico
    arranca el día siguiente al último dato, o sea el domingo 2026-03-22."""

    def test_a_regular_business_is_forecast_exactly_with_a_zero_error(self):
        out = build_forecast(weekly(11))
        assert out["status"] == "ok" and out["method"] == "weekday_average" and out["horizonDays"] == 14
        assert out["points"][0]["date"] == "2026-03-22" and out["points"][-1]["date"] == "2026-04-04"
        assert [p["expected"] for p in out["points"][:7]] == ["0.00", "100.00", "110.00", "120.00", "130.00", "200.00", "300.00"]
        assert all(p["lower"] == p["expected"] == p["upper"] for p in out["points"])  # sin variación, sin intervalo
        assert out["backtest"] == {"days": 14, "wape": "0.0"}

    def test_a_closed_day_is_information_not_a_gap(self):
        assert build_forecast(weekly(11))["points"][0]["expected"] == "0.00"  # el domingo cerrado se pronostica en 0

    def test_the_backtest_measures_the_real_error_it_would_have_made(self):
        last_two_weeks = (MONDAY + timedelta(days=n) for n in range(63, 77))
        bump = {d: 2 * PATTERN[d.isoweekday()] for d in last_two_weeks if d.isoweekday() in PATTERN}
        out = build_forecast(weekly(11, bump=bump))  # las últimas dos semanas se duplican y el método no las vio
        assert out["backtest"]["wape"] == "50.0"  # |2x - x| / 2x

    def test_the_interval_surrounds_the_estimate_and_never_goes_below_zero_for_sales(self):
        rows = [row(MONDAY + timedelta(days=n), 10 if (n // 7) % 2 else 200) for n in range(70)]
        for p in build_forecast(rows)["points"]:
            assert Decimal(p["lower"]) <= Decimal(p["expected"]) <= Decimal(p["upper"]) and Decimal(p["lower"]) >= 0

    def test_with_negative_history_the_interval_may_go_below_zero(self):
        rows = [row(MONDAY + timedelta(days=n), -50 if n % 2 else 40) for n in range(70)]
        assert any(Decimal(p["lower"]) < 0 for p in build_forecast(rows)["points"])

    def test_less_than_eight_weeks_says_so_and_has_no_points(self):
        out = build_forecast([row(MONDAY + timedelta(days=n), 10) for n in range(55)])
        assert out["status"] == "insufficient_data" and out["points"] == [] and out["backtest"] is None
        assert build_forecast([row(MONDAY + timedelta(days=n), 10) for n in range(56)])["status"] == "ok"

    def test_a_few_scattered_rows_over_a_long_span_are_not_enough_history(self):
        sparse = [row(MONDAY + timedelta(days=n), 100) for n in (0, 30, 60, 90)]  # 4 días con datos en 13 semanas
        out = build_forecast(sparse)
        assert out["status"] == "insufficient_data" and out["points"] == [] and out["backtest"] is None

        # La frontera es la DENSIDAD (60 % de los días del rango con datos), con el rango ya cumplido (60 días):
        def history(days):
            return [row(MONDAY + timedelta(days=n), 10) for n in days]

        assert build_forecast(history([*range(0, 34), 59]))["status"] == "insufficient_data"  # 35 de 60 = 0.58
        assert build_forecast(history([*range(0, 35), 59]))["status"] == "ok"  # 36 de 60 = 0.6 exacto: alcanza
        assert build_forecast(history([0, *range(2, 58, 2), 59]))["status"] == "insufficient_data"  # un día sí y otro no: 50 %

    def test_with_only_eight_to_ten_weeks_there_is_a_forecast_but_no_backtest(self):
        out = build_forecast([row(MONDAY + timedelta(days=n), 10) for n in range(60)])  # el corte dejaría < 8 semanas
        assert out["status"] == "ok" and out["backtest"] is None

    def test_a_backtest_over_nothing_sold_has_no_error_percentage(self):
        out = build_forecast([row(MONDAY + timedelta(days=n), 0) for n in range(70)])
        assert out["backtest"] == {"days": 14, "wape": None}


@pytest.fixture(scope="module")
def doc():
    return yaml.safe_load((Path(__file__).parents[2] / "contracts" / "openapi.yaml").read_text(encoding="utf-8"))


def validate(doc, name, instance):
    schema = {"$ref": f"#/components/schemas/{name}", "components": doc["components"]}
    errors = sorted(Draft202012Validator(schema).iter_errors(instance), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors[:3]]


class TestContractConformance:
    """Lo que produce el worker TIENE que cumplir el esquema del contrato: si uno cambia sin el otro, cae aquí."""

    def test_a_rich_dataset(self, doc):
        rows = [
            row(r.date, r.amount, product=("pan", "leche", "té")[i % 3], branch=("norte", "sur")[i % 2], order=f"P{i}")
            for i, r in enumerate(weekly(11, bump={date(2026, 2, 11): 900}, noise=True))
        ]
        out = build_insights(rows, date(2026, 3, 21))
        assert (
            out["forecast"]["status"] == "ok" and out["forecast"]["backtest"] and out["anomalies"]["items"]
        )  # todas las partes presentes
        validate(doc, "Insights", out)

    def test_a_sparse_dataset_with_every_optional_part_null(self, doc):
        out = build_insights([row(date(2026, 1, 5), 10)], date(2026, 1, 5))
        assert out["branches"] is None and out["pareto"] is None and out["forecast"]["status"] == "insufficient_data"
        validate(doc, "Insights", out)

    def test_the_quality_report_too(self, doc):
        table = Table(
            ["fecha", "total", "p"], iter([(2, ["2026-01-05", "10", "pan"]), (3, ["ayer", "5", "x"]), (4, ["", "", ""])])
        )
        _, report = clean(table, {"date": 0, "amount": 1, "product": 2}, today=date(2026, 11, 18))
        validate(doc, "QualityReport", report)

    def test_the_net_amount_is_the_total_of_the_quality_report(self):
        table = Table(["f", "t"], iter([(i, [f"2026-01-{i:02d}", f"{i}.{i:02d}"]) for i in range(2, 12)]))
        kept, report = clean(table, {"date": 0, "amount": 1}, today=date(2026, 11, 18))
        assert build_insights(kept, date(2026, 11, 18))["indicators"]["netAmount"] == report["totalAmount"]
