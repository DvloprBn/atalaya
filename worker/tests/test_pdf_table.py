"""v0.12: del PDF a la tabla lógica, y de ahí a la MISMA tubería de v0.9 (vista previa, limpieza, informe)."""

import hashlib
from datetime import date
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator
from pdf_maker import VENTAS, make_pdf

from atalaya_worker.cleaner import clean
from atalaya_worker.failure import AnalysisFail
from atalaya_worker.pdf_table import build_pdf_table
from atalaya_worker.review import review
from atalaya_worker.store import Job
from atalaya_worker.tabular import read_table
from atalaya_worker.verdict import REASONS

TODAY = date(2026, 11, 19)
KEY = "cd" * 16  # nombre de 32 hex armado a propósito (un literal largo lo toma gitleaks por una llave)
HEADER, *ROWS = VENTAS
MORE = [["2026-03-03", "Té chai", "1", "48.00"], ["2026-03-04", "Latte", "1", "52.00"]]
CONTRACT = yaml.safe_load((Path(__file__).parents[2] / "contracts" / "openapi.yaml").read_text(encoding="utf-8"))


def rows_of(table) -> list:
    return list(table.rows)


class TestTheLogicalTable:
    def test_one_table_is_a_csv_with_numbered_rows(self):
        table = build_pdf_table([(1, VENTAS)])
        assert table.header == HEADER
        assert rows_of(table) == [(2, ROWS[0]), (3, ROWS[1]), (4, ROWS[2])]
        assert table.skipped == []

    def test_a_continuation_that_repeats_the_header_drops_it_and_one_that_does_not_keeps_everything(self):
        table = build_pdf_table([(1, VENTAS), (2, [HEADER, *MORE]), (3, [["2026-03-05", "Latte", "2", "104.00"]] * 2)])
        rows = rows_of(table)
        assert len(rows) == 3 + 2 + 2 and HEADER not in [r for _, r in rows]
        assert [n for n, _ in rows] == list(range(2, 9))  # sin huecos: la fila repetida no era un dato

    def test_a_table_with_another_width_is_skipped_and_counted_with_its_page(self):
        totals = [["Total", "251.00"], ["IVA", "40.16"]]
        table = build_pdf_table([(1, VENTAS), (4, totals)])
        assert len(rows_of(table)) == 3
        assert table.skipped == [("table_skipped", 4, "Total"), ("table_skipped", 4, "IVA")]

    def test_short_rows_are_filled_to_the_header_width(self):
        table = build_pdf_table([(1, [HEADER, ["2026-03-01", "Latte", "2", "104.00"], ["2026-03-01", "Latte"]])])
        assert rows_of(table)[1] == (3, ["2026-03-01", "Latte", "", ""])


class TestTheSamePipeline:
    def test_a_two_page_pdf_is_read_and_cleaned_with_exact_figures(self):
        pdf = make_pdf(
            [[("text", "Reporte"), ("table", VENTAS)], [("table", [HEADER, *MORE]), ("table", [["Total", "351.00"]] * 2)]]
        )
        table = read_table(pdf, "pdf")
        kept, report = clean(table, {"date": 0, "product": 1, "quantity": 2, "amount": 3}, today=TODAY)
        # A mano: 104 + 42 + 105 + 48 + 52 = 351.00; la tabla de totales (2 filas, otra anchura) se cuenta y se tira.
        assert report["totalAmount"] == "351.00"
        assert (report["rowsRead"], report["rowsKept"], report["rowsDropped"]) == (7, 5, 2)
        assert [i for i in report["issues"] if i["code"] == "table_skipped"] == [
            {"code": "table_skipped", "count": 2, "dropped": True, "examples": [{"row": 2, "value": "Total"}] * 2}
        ]
        schema = {"$ref": "#/components/schemas/QualityReport", "components": CONTRACT["components"]}
        assert list(Draft202012Validator(schema).iter_errors(report)) == []
        assert len(kept) == 5

    @pytest.mark.parametrize(
        "data",
        [b"x", make_pdf([[("lines",)]]), make_pdf([[("table", VENTAS)]], catalog_extra="/OpenAction << /S /JavaScript >>")],
    )
    def test_an_unreadable_pdf_fails_the_analysis_as_unreadable(self, data):
        # El motivo fino (sin texto, contenido activo…) ya lo dio la revisión del archivo; el análisis no lo repite.
        with pytest.raises(AnalysisFail) as info:
            read_table(data, "pdf")
        assert info.value.reason == "unreadable"


class TestTheDeepReview:
    def verdict(self, tmp_path, data, kind="pdf"):
        (tmp_path / KEY).write_bytes(data)
        job = Job(id="u", kind=kind, sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data), storage_key=KEY)
        return review(str(tmp_path), job)

    def test_a_good_pdf_passes_and_the_reasons_come_through(self, tmp_path):
        assert self.verdict(tmp_path, make_pdf([[("table", VENTAS)]])) is None
        assert self.verdict(tmp_path, make_pdf([[("lines",)]])) == "no_text_layer"
        assert (
            self.verdict(tmp_path, make_pdf([[("table", VENTAS)]], catalog_extra="/AA << /O << /JS (x) >> >>"))
            == "active_content"
        )

    def test_the_signature_must_match_the_declared_kind(self, tmp_path):
        assert self.verdict(tmp_path, b"fecha,total\n2026-03-01,10\n") == "corrupt"  # un CSV declarado como PDF
        assert self.verdict(tmp_path, make_pdf([[("table", VENTAS)]]), "csv") == "corrupt"  # un PDF declarado como CSV

    def test_a_kind_the_worker_does_not_know_is_rejected(self, tmp_path):
        # Cerrado por defecto. Sin esta prueba, una edición que se comió el `else` de `review` pasó inadvertida un rato.
        assert self.verdict(tmp_path, make_pdf([[("table", VENTAS)]]), "docx") == "corrupt"


class TestTheContract:
    def test_every_reject_reason_of_the_contract_is_known_by_the_worker_and_back(self):
        """Tercera copia de la lista cerrada (contrato, CHECK de la base y `verdict.py`): si crece una sin las otras,
        el worker lanza `ValueError` con un motivo nuevo, o deja uno del contrato sin poder usarse (lección 264)."""
        assert set(CONTRACT["components"]["schemas"]["UploadRejectReason"]["enum"]) == REASONS

    def test_the_kinds_of_the_contract_include_pdf(self):
        assert "pdf" in CONTRACT["components"]["schemas"]["Upload"]["properties"]["kind"]["enum"]
