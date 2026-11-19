import base64
import hashlib
import io
import os
import zipfile
from datetime import date
from pathlib import Path

import pytest
import yaml
from conftest import make_cfdi, make_zip
from jsonschema import Draft202012Validator

from atalaya_worker.cfdi import parse_cfdi
from atalaya_worker.cfdi_table import HEADER, build_cfdi_table
from atalaya_worker.cfdi_zip import read_cfdi_zip
from atalaya_worker.cleaner import clean
from atalaya_worker.failure import AnalysisFail
from atalaya_worker.preview import build_preview
from atalaya_worker.review import review
from atalaya_worker.store import Job
from atalaya_worker.tabular import read_table
from atalaya_worker.verdict import Reject

TODAY = date(2026, 11, 18)
KEY = "ab" * 16  # nombre de archivo de 32 hex, armado a propósito: un literal largo lo toma gitleaks por una llave
XXE = make_cfdi(doctype='<!DOCTYPE c [<!ENTITY x SYSTEM "file:///etc/passwd">]>')


def zip_reason(data: bytes) -> str | None:
    try:
        read_cfdi_zip(data)
    except Reject as rejected:
        return rejected.reason
    return None


class TestZip:
    def test_a_zip_of_comprobantes_is_read_in_order(self):
        data = make_zip({"a.xml": make_cfdi(folio="1"), "b.XML": make_cfdi(folio="2"), "carpeta/c.xml": make_cfdi(folio="3")})
        assert [d.folio for d in read_cfdi_zip(data)] == ["A1", "A2", "A3"]

    def test_one_bad_entry_rejects_the_whole_zip_and_an_xxe_inside_a_zip_is_caught_here(self):
        good = make_cfdi()
        assert zip_reason(make_zip({"a.xml": good, "b.xml": XXE})) == "corrupt"  # la API no abre zips: esta es la única barrera
        assert zip_reason(make_zip({"a.xml": good, "b.xml": b"<nota/>"})) == "not_cfdi"

    @pytest.mark.parametrize(
        "entries",
        [
            {"a.xml": make_cfdi(), "foto.png": b"\x89PNG"},
            {"a.xml": make_cfdi(), "doc.pdf": b"%PDF"},
            {"a.xml": make_cfdi(), "sin-extension": b"x"},
        ],
    )
    def test_every_entry_must_be_an_xml(self, entries):
        assert zip_reason(make_zip(entries)) == "corrupt"

    def test_a_zip_inside_a_zip_is_refused(self):
        assert zip_reason(make_zip({"a.xml": make_cfdi(), "dentro.zip": make_zip({"b.xml": make_cfdi()})})) == "corrupt"

    def test_an_excel_workbook_renamed_to_zip_is_not_a_cfdi_zip(self):
        workbook = make_zip({"[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>", "_rels/.rels": "<r/>"})
        assert zip_reason(workbook) in {
            "corrupt",
            "not_cfdi",
        }  # ya la puerta de la API lo rechaza; aquí, sus XML no son comprobantes

    def test_empty_and_directory_only_zips(self):
        assert zip_reason(make_zip({})) == "empty"
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.mkdir("carpeta")
        assert zip_reason(buffer.getvalue()) == "empty"

    def test_not_a_zip_at_all(self):
        assert zip_reason(b"PK\x03\x04 no soy un zip") == "corrupt"
        assert zip_reason(make_cfdi()) == "corrupt"

    def test_too_many_entries(self):
        assert zip_reason(make_zip({f"{n}.xml": make_cfdi() for n in range(501)})) == "too_many_entries"

    def test_zip_bomb_declared_and_real(self):
        bomb = make_zip({"a.xml": make_cfdi(), "relleno.xml": b"0" * (60 * 1024 * 1024)})
        assert len(bomb) < 1_000_000 and zip_reason(bomb) == "zip_bomb"

    def test_an_entry_over_one_megabyte_is_too_large(self):
        assert (
            zip_reason(
                make_zip({"a.xml": make_cfdi(body_extra="<!--" + base64.b64encode(os.urandom(900 * 1024)).decode() + "-->")})
            )
            == "range_too_large"
        )

    def test_path_traversal_names_and_repeated_names(self):
        assert zip_reason(make_zip({"../../evil.xml": make_cfdi()})) == "corrupt"
        assert zip_reason(make_zip({"/abs.xml": make_cfdi()})) == "corrupt"

    def test_the_conceptos_of_the_whole_zip_are_capped(self, monkeypatch):
        monkeypatch.setattr("atalaya_worker.cfdi_zip.MAX_ROWS", 3)
        assert zip_reason(make_zip({"a.xml": make_cfdi(), "b.xml": make_cfdi()})) == "range_too_large"  # 2 + 2 > 3


class TestVirtualTable:
    def table_of(self, *documents):
        return build_cfdi_table([parse_cfdi(d) for d in documents])

    def test_one_row_per_concepto_with_the_expected_columns(self):
        table = self.table_of(make_cfdi())
        rows = list(table.rows)
        assert table.header == HEADER and len(rows) == 2 and table.skipped == []
        number, cells = rows[0]
        as_dict = dict(zip(HEADER, cells, strict=True))
        assert number == 2  # el 1 es el encabezado
        assert (as_dict["fecha"], as_dict["concepto"], as_dict["cantidad"], as_dict["importe"], as_dict["iva"]) == (
            "2026-03-15",
            "Latte",
            "2",
            "104.00",
            "16.64",
        )
        assert (as_dict["emisor_rfc"], as_dict["receptor_nombre"], as_dict["moneda"], as_dict["tipo"]) == (
            "EKU9003173C9",
            "PUBLICO EN GENERAL",
            "MXN",
            "I",
        )

    def test_a_nota_de_credito_is_negative_in_amount_quantity_and_iva(self):
        (_, cells), *_ = list(self.table_of(make_cfdi(tipo="E")).rows)
        as_dict = dict(zip(HEADER, cells, strict=True))
        assert (as_dict["importe"], as_dict["cantidad"], as_dict["iva"]) == ("-104.00", "-2", "-16.64")

    def test_a_zero_stays_zero_and_text_that_is_not_a_number_is_left_for_the_cleaner(self):
        (_, cells), *_ = list(self.table_of(make_cfdi(tipo="E", concepts=(("x", "1", "mucho", "", "0.00"),))).rows)
        as_dict = dict(zip(HEADER, cells, strict=True))
        assert (as_dict["importe"], as_dict["iva"]) == ("mucho", "0")  # «-0» no existe; y lo ilegible no se «arregla»

    @pytest.mark.parametrize(
        ("tipo", "moneda", "code"),
        [
            ("P", "XXX", "unsupported_document"),
            ("T", "XXX", "unsupported_document"),
            ("N", "MXN", "unsupported_document"),
            ("I", "USD", "unsupported_currency"),
            ("E", "EUR", "unsupported_currency"),
            ("I", "", "unsupported_currency"),
        ],
    )
    def test_what_is_not_a_sale_or_an_expense_in_pesos_is_skipped_and_noted(self, tipo, moneda, code):
        table = self.table_of(make_cfdi(), make_cfdi(tipo=tipo, moneda=moneda))
        assert len(list(table.rows)) == 2
        assert [(c, n) for c, n, _ in table.skipped] == [(code, 4)]  # el renglón virtual 4: después de los 2 de datos (2 y 3)

    def test_the_date_is_the_issue_date_without_time_and_never_moved_across_zones(self):
        (_, cells), *_ = list(self.table_of(make_cfdi(fecha="2026-03-15T23:59:59")).rows)
        assert cells[0] == "2026-03-15"  # a las 23:59 la fecha NO cambia (sin hora ni zona)
        (_, bad), *_ = list(self.table_of(make_cfdi(fecha="15/03/2026")).rows)
        assert bad[0] == "15/03/2026"  # lo que no es una fecha de emisión válida lo cuenta la limpieza (bad_date)


class TestCleaningAFile:
    MAPPING = {"date": 0, "orderId": 1, "product": 8, "quantity": 9, "amount": 10}

    def run(self, *documents, mapping=None):
        return clean(build_cfdi_table([parse_cfdi(d) for d in documents]), mapping or self.MAPPING, today=TODAY)

    def test_the_skipped_are_read_and_dropped_and_the_books_balance(self):
        docs = [
            make_cfdi(uuid="11111111-1111-4111-8111-111111111111"),
            make_cfdi(tipo="P", moneda="XXX"),
            make_cfdi(moneda="USD"),
            make_cfdi(tipo="N"),
        ]
        kept, report = self.run(*docs)
        assert (
            len(kept) == 2 and report["rowsRead"] == 5 and report["rowsDropped"] == 3
        )  # 2 conceptos + 3 comprobantes descartados
        assert report["rowsKept"] + report["rowsDropped"] == report["rowsRead"]
        issues = {i["code"]: i for i in report["issues"]}
        assert issues["unsupported_document"]["count"] == 2 and issues["unsupported_document"]["dropped"] is True
        assert issues["unsupported_currency"]["count"] == 1
        assert [e["value"] for e in issues["unsupported_document"]["examples"]] == ["P", "N"]  # qué era lo que se descartó

    def test_a_file_where_everything_is_skipped_has_nothing_left(self):
        with pytest.raises(AnalysisFail) as info:
            self.run(make_cfdi(tipo="P"), make_cfdi(moneda="USD"))
        assert info.value.reason == "nothing_left"

    def test_a_factura_with_several_conceptos_is_one_order_but_the_same_row_twice_is_a_duplicate(self):
        kept, _ = self.run(make_cfdi())
        assert len(kept) == 2 and len({r.order_id for r in kept}) == 1  # dos conceptos, un solo UUID = un pedido
        kept, report = self.run(make_cfdi(), make_cfdi())  # el MISMO CFDI en dos archivos
        assert len(kept) == 2 and next(i for i in report["issues"] if i["code"] == "duplicate_row")["count"] == 2

    def test_a_nota_de_credito_is_a_return_and_the_total_is_exact(self):
        kept, report = self.run(
            make_cfdi(uuid="22222222-2222-4222-8222-222222222222"),
            make_cfdi(tipo="E", uuid="33333333-3333-4333-8333-333333333333", concepts=(("Latte", "1", "52.00", "", "8.32"),)),
        )
        assert report["totalAmount"] == "92.00"  # 104.00 + (42.00 - 2.00 de descuento) - 52.00
        assert next(i for i in report["issues"] if i["code"] == "negative_amount")["count"] == 1

    def test_a_hostile_concept_name_is_cleaned_like_any_other_text(self):
        hostile = (("=HYPERLINK(&quot;http://x&quot;)\u202e", "1", "10.00", "", "1.60"),)
        kept, _ = self.run(make_cfdi(concepts=hostile))
        assert "‮" not in kept[0].product


class TestPreviewOfACfdi:
    def test_it_suggests_the_uuid_as_the_order_and_the_concepto_as_the_product(self):
        preview = build_preview(build_cfdi_table([parse_cfdi(make_cfdi())]))
        assert preview["suggested"] == {"date": 0, "orderId": 1, "product": 8, "quantity": 9, "amount": 10}
        assert [c["name"] for c in preview["columns"]][:3] == ["fecha", "uuid", "folio"]


class TestReadTableAndReview:
    def test_read_table_for_xml_and_zip_and_failures_become_unreadable(self):
        assert len(list(read_table(make_cfdi(), "xml").rows)) == 2
        assert len(list(read_table(make_zip({"a.xml": make_cfdi(), "b.xml": make_cfdi()}), "zip").rows)) == 4
        for data, kind in [(XXE, "xml"), (b"<nota/>", "xml"), (make_zip({"a.txt": b"x"}), "zip")]:
            with pytest.raises(AnalysisFail) as info:
                read_table(data, kind)
            assert info.value.reason == "unreadable"

    def verdict(self, tmp_path, data, kind):
        name = KEY
        (tmp_path / name).write_bytes(data)
        return review(
            str(tmp_path), Job(id="u", kind=kind, sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data), storage_key=name)
        )

    def test_the_deep_review_of_xml_and_zip(self, tmp_path):
        assert self.verdict(tmp_path, make_cfdi(), "xml") is None
        assert self.verdict(tmp_path, make_zip({"a.xml": make_cfdi()}), "zip") is None
        assert self.verdict(tmp_path, XXE, "xml") == "corrupt"
        assert self.verdict(tmp_path, b"<nota/>", "xml") == "not_cfdi"
        assert self.verdict(tmp_path, make_zip({"a.xml": XXE}), "zip") == "corrupt"
        assert self.verdict(tmp_path, make_zip({f"{n}.xml": make_cfdi() for n in range(501)}), "zip") == "too_many_entries"

    def test_the_signature_must_match_the_declared_kind(self, tmp_path):
        assert self.verdict(tmp_path, make_zip({"a.xml": make_cfdi()}), "xml") == "corrupt"  # un zip declarado como xml
        assert self.verdict(tmp_path, make_cfdi(), "zip") == "corrupt"  # un xml declarado como zip

    def test_the_sha_is_still_checked(self, tmp_path):
        data = make_cfdi()
        (tmp_path / KEY).write_bytes(data)
        job = Job(id="u", kind="xml", sha256="0" * 64, size_bytes=len(data), storage_key=KEY)
        assert review(str(tmp_path), job) == "corrupt"


class TestTheContractKnowsTheNewCodes:
    def test_a_report_with_the_new_issue_codes_conforms(self):
        doc = yaml.safe_load((Path(__file__).parents[2] / "contracts" / "openapi.yaml").read_text(encoding="utf-8"))
        schema = {"$ref": "#/components/schemas/QualityReport", "components": doc["components"]}
        _, report = clean(
            build_cfdi_table([parse_cfdi(make_cfdi()), parse_cfdi(make_cfdi(tipo="P", moneda="XXX"))]),
            {"date": 0, "orderId": 1, "product": 8, "amount": 10},
            today=TODAY,
        )
        errors = list(Draft202012Validator(schema).iter_errors(report))
        assert not errors and {i["code"] for i in report["issues"]} == {"unsupported_document"}
        reasons = doc["components"]["schemas"]["UploadRejectReason"]["enum"]
        assert {"not_cfdi", "corrupt", "range_too_large", "zip_bomb", "too_many_entries", "empty"} <= set(reasons)
