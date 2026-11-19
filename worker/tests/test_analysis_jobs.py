import hashlib
import os
from pathlib import Path

import psycopg
import pytest

from atalaya_worker import analysis_jobs
from atalaya_worker.analysis_store import AnalysisWork
from atalaya_worker.queues import ANALYSIS_STREAM, GROUP
from atalaya_worker.store import Job

CSV = b"fecha,total,producto\n2026-01-01,10.50,pan\n2026-01-02,5,=SUMA(1)\n"
UPLOAD_FILE = "abcdef0123456789abcdef0123456789"  # nombre del archivo subido
RESULT_FILE = "00112233445566778899aabbccddeeff"
MAPPING = {"date": 0, "amount": 1, "product": 2, "dateOrder": "auto", "decimalSeparator": "auto"}


class FakeQueue:
    def __init__(self, marker_free=True):
        self.marker_free, self.acked, self.sets = marker_free, [], []

    def set(self, name, value, nx=False, ex=None):
        self.sets.append((name, nx, ex))
        return True if self.marker_free else None

    def xack(self, stream, group, message_id):
        self.acked.append((stream, group, message_id))


class FakeStore:
    def __init__(self, work, claim=True, saves=True, boom=None):
        self.work, self._claim, self._saves, self.boom = work, claim, saves, boom
        self.preview = self.report = None
        self.failed = []

    def load(self, _id):
        return self.work

    def claim_running(self, _id):
        return self._claim

    def save_preview(self, _id, preview):
        if self.boom:
            raise self.boom
        self.preview = preview
        return self._saves

    def save_report(self, _id, report):
        if self.boom:
            raise self.boom
        self.report = report
        return self._saves

    def fail(self, _id, reason):
        self.failed.append(reason)
        return True


@pytest.fixture
def dirs(tmp_path):
    uploads, results = tmp_path / "up", tmp_path / "res"
    uploads.mkdir()
    results.mkdir()
    (uploads / UPLOAD_FILE).write_bytes(CSV)
    return str(uploads), str(results)


def work(status="previewing", mapping=None, upload_status="accepted", data=CSV, kind="csv"):
    job = Job(id="up1", kind=kind, sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data), storage_key=UPLOAD_FILE)
    return AnalysisWork("an1", status, mapping, RESULT_FILE, job, upload_status)


def run(store, queue, dirs):
    analysis_jobs.handle_analysis(queue, store, dirs[0], dirs[1], "1-0", "an1")


def files(dirs):
    return sorted(os.listdir(dirs[1]))


class TestPreviewStage:
    def test_leaves_the_preview_and_acks_without_writing_files(self, dirs):
        store, queue = FakeStore(work()), FakeQueue()
        run(store, queue, dirs)
        assert store.preview["rowCount"] == 2 and store.preview["suggested"]["date"] == 0
        assert store.failed == [] and files(dirs) == []
        assert queue.acked == [(ANALYSIS_STREAM, GROUP, "1-0")]
        assert queue.sets[0][0] == "atalaya:worker:started:an1:preview" and queue.sets[0][1] is True  # SET NX

    def test_an_unaccepted_upload_is_never_read(self, dirs):
        store = FakeStore(work(upload_status="rejected"))
        run(store, FakeQueue(), dirs)
        assert store.failed == ["unreadable"] and store.preview is None

    def test_the_worker_does_not_trust_the_disk(self, dirs):
        store = FakeStore(work(data=b"fecha,total\n1,2\n"))  # el hash anotado no es el del archivo que hay en disco
        run(store, FakeQueue(), dirs)
        assert store.failed == ["unreadable"]

    def test_an_unreadable_file_fails_with_a_closed_reason(self, dirs):
        Path(dirs[0], UPLOAD_FILE).write_bytes(b"solo\n")
        store = FakeStore(work(data=b"solo\n"))
        run(store, FakeQueue(), dirs)
        assert store.failed == ["too_few_columns"]


class TestCleanStage:
    def test_writes_both_csv_saves_the_report_and_sanitizes_formulas(self, dirs):
        store, queue = FakeStore(work("queued", MAPPING)), FakeQueue()
        run(store, queue, dirs)
        assert store.report["rowsKept"] == 2 and store.report["totalAmount"] == "15.50" and store.failed == []
        assert files(dirs) == [f"{RESULT_FILE}.clean.csv", f"{RESULT_FILE}.report.csv"]  # sin temporales
        text = (Path(dirs[1]) / f"{RESULT_FILE}.clean.csv").read_text(encoding="utf-8-sig")
        assert "'=SUMA(1)" in text  # la fórmula del archivo salió neutralizada
        assert queue.acked

    def test_a_bad_mapping_fails_and_leaves_no_files(self, dirs):
        store = FakeStore(work("queued", {"date": 0, "amount": 0}))
        run(store, FakeQueue(), dirs)
        assert store.failed == ["mapping_invalid"] and files(dirs) == []

    def test_nothing_left_fails_and_leaves_no_files(self, dirs):
        store = FakeStore(work("queued", {"date": 2, "amount": 1}))  # la «fecha» sería el texto del producto: ninguna fila vale
        run(store, FakeQueue(), dirs)
        assert store.failed == ["nothing_left"] and files(dirs) == []

    def test_if_the_analysis_was_deleted_meanwhile_the_files_are_removed(self, dirs):
        store = FakeStore(work("queued", MAPPING), saves=False)  # save_report toca 0 filas: ya no existe
        run(store, FakeQueue(), dirs)
        assert store.failed == [] and files(dirs) == []

    def test_if_another_worker_took_it_nothing_happens(self, dirs):
        store = FakeStore(work("queued", MAPPING), claim=False)
        queue = FakeQueue()
        run(store, queue, dirs)
        assert store.report is None and store.failed == [] and queue.acked


class TestDeathInTheMiddle:
    @pytest.mark.parametrize("status", ["previewing", "queued"])
    def test_a_stage_that_already_started_is_not_run_again(self, dirs, status):
        store = FakeStore(work(status, MAPPING))
        run(store, FakeQueue(marker_free=False), dirs)  # la marca ya existía: el mensaje VOLVIÓ
        assert store.failed == ["worker_timeout"] and store.preview is None and store.report is None

    def test_a_running_analysis_was_left_half_done(self, dirs):
        (Path(dirs[1]) / f"{RESULT_FILE}.clean.csv.tmp").write_text("a medias")
        store = FakeStore(work("running", MAPPING))
        run(store, FakeQueue(), dirs)
        assert store.failed == ["worker_timeout"] and files(dirs) == []  # y no quedan restos

    def test_nothing_to_do_still_acks(self, dirs):
        queue = FakeQueue()
        run(FakeStore(None), queue, dirs)
        assert queue.acked


class TestFailuresThatAreNotTheFilesFault:
    def test_a_database_error_is_not_acked_so_it_is_retried(self, dirs):
        queue = FakeQueue()
        with pytest.raises(psycopg.OperationalError):
            run(FakeStore(work(), boom=psycopg.OperationalError("caída")), queue, dirs)
        assert queue.acked == []

    def test_an_unexpected_bug_does_not_leave_it_half_done(self, dirs, monkeypatch):
        def boom(*_):
            raise MemoryError

        monkeypatch.setattr(analysis_jobs, "build_preview", boom)
        store = FakeStore(work())
        run(store, FakeQueue(), dirs)
        assert store.failed == ["unreadable"]

    def test_a_slow_file_is_cut_with_worker_timeout(self, dirs, monkeypatch):
        monkeypatch.setattr(analysis_jobs, "SECONDS_PER_ANALYSIS", 1)
        monkeypatch.setattr(analysis_jobs, "build_preview", lambda *_: [None for _ in iter(int, 1)])  # bucle infinito
        store = FakeStore(work())
        run(store, FakeQueue(), dirs)
        assert store.failed == ["worker_timeout"]
