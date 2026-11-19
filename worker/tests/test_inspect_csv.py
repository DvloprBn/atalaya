import pytest

from atalaya_worker.inspect_csv import inspect_csv
from atalaya_worker.limits import MAX_COLS, MAX_ROWS
from atalaya_worker.verdict import Reject


def reason_of(data: bytes) -> str | None:
    try:
        inspect_csv(data)
    except Reject as rejected:
        return rejected.reason
    return None


def test_a_normal_csv_passes_with_or_without_bom():
    assert reason_of(b"fecha,total\n2026-01-01,10\n") is None
    assert reason_of(b"\xef\xbb\xbffecha,total\r\n2026-01-01,10\r\n") is None


@pytest.mark.parametrize("data", [b"", b"\n\n", b"fecha,total\n", b" , \n,\n"])
def test_without_data_rows_it_is_empty(data):
    assert reason_of(data) == "empty"


def test_range_limits():
    assert reason_of(("a\n" * (MAX_ROWS + 1)).encode()) == "range_too_large"
    assert reason_of(("a\n" * MAX_ROWS).encode()) is None
    assert reason_of((",".join("x" * 3 for _ in range(MAX_COLS + 1)) + "\nb\n").encode()) == "range_too_large"


@pytest.mark.parametrize("data", [b"a;b\n\xf1\n", b"a,b\n\x00,1\n", b'a,b\n"sin cerrar,1\n2,3\n'])
def test_broken_csv_is_corrupt(data):
    assert reason_of(data) == "corrupt"


def test_a_giant_cell_is_corrupt():
    assert reason_of(b"a,b\n" + b'"' + b"x" * ((1 << 20) + 1) + b'",1\n') == "corrupt"
