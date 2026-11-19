import pytest
from conftest import CONTENT_TYPES, make_xlsx, make_zip, sheet_xml

from atalaya_worker.inspect_xlsx import inspect_xlsx
from atalaya_worker.limits import MAX_ROWS, MAX_ZIP_ENTRIES
from atalaya_worker.verdict import Reject


def reason_of(data: bytes) -> str | None:
    try:
        inspect_xlsx(data)
    except Reject as rejected:
        return rejected.reason
    return None


def test_a_normal_workbook_passes():
    assert reason_of(make_xlsx()) is None


def test_a_workbook_with_no_cells_is_empty():
    assert reason_of(make_xlsx(sheet_xml(rows=0))) == "empty"


def test_zip_bomb_pocos_kb_que_se_vuelven_cientos_de_mb():
    bomb = make_xlsx(**{"xl/worksheets/sheet2.xml": b"0" * (300 * 1024 * 1024)})
    assert len(bomb) < 1_000_000  # la bomba pesa menos de 1 MB...
    assert reason_of(bomb) == "zip_bomb"  # ...y se detecta sin descomprimirla entera


def test_a_ratio_above_the_limit_is_a_bomb_even_if_small():
    assert reason_of(make_xlsx(**{"xl/padding.bin": b"0" * (3 * 1024 * 1024)})) == "zip_bomb"


def test_too_many_entries():
    extra = {f"xl/media/i{n}.txt": "x" for n in range(MAX_ZIP_ENTRIES + 1)}
    assert reason_of(make_xlsx(**extra)) == "too_many_entries"


@pytest.mark.parametrize("dimension", ["A1:XFD1048576", "A1:B50001", "A1:GS3"])
def test_a_giant_declared_range_is_rejected_even_if_the_file_is_tiny(dimension):
    assert reason_of(make_xlsx(sheet_xml(dimension=dimension))) == "range_too_large"


def test_a_row_number_beyond_the_limit_is_rejected_without_declaring_a_dimension():
    sheet = f'<worksheet><sheetData><row r="{MAX_ROWS + 1}"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'
    assert reason_of(make_xlsx(sheet)) == "range_too_large"


def test_more_rows_than_the_limit_is_rejected():
    # Valores distintos: un archivo REAL no se comprime 1000 a 1 (si no, saltaría antes la regla de la bomba).
    rows = "".join(f"<row><c><v>{n * 7919 % 10007}</v></c></row>" for n in range(MAX_ROWS + 1))
    assert reason_of(make_xlsx(f"<worksheet><sheetData>{rows}</sheetData></worksheet>")) == "range_too_large"


XXE = '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><worksheet><c r="A1"><v>&x;</v></c></worksheet>'
LAUGHS = (
    '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">'
    '<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><worksheet><c r="A1"><v>&c;</v></c></worksheet>'
)


@pytest.mark.parametrize("xml", [XXE, LAUGHS, "<worksheet><c", "no es xml"])
def test_hostile_or_broken_xml_is_rejected_as_corrupt(xml):
    assert reason_of(make_xlsx(xml)) == "corrupt"


def test_macros_zip_slip_duplicates_and_non_zip_are_corrupt():
    assert reason_of(make_xlsx(**{"xl/vbaProject.bin": b"x"})) == "corrupt"
    assert reason_of(make_xlsx(**{"../../evil.xml": "x"})) == "corrupt"
    assert reason_of(make_xlsx(**{"/abs.xml": "x"})) == "corrupt"
    assert reason_of(b"PK\x03\x04 esto no es un zip") == "corrupt"
    assert reason_of(make_zip({CONTENT_TYPES: "<Types/>"})) == "corrupt"  # sin xl/workbook.xml


def test_duplicate_entry_names_are_corrupt():
    import io
    import warnings
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf, warnings.catch_warnings():
        warnings.simplefilter("ignore")  # Python avisa del duplicado: justo lo que probamos
        for _ in range(2):
            zf.writestr("xl/workbook.xml", "<workbook/>")
        zf.writestr(CONTENT_TYPES, "<Types/>")
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml())
    assert reason_of(buf.getvalue()) == "corrupt"
