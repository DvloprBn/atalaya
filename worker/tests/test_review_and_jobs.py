import hashlib
import os

import pytest

from atalaya_worker import jobs, review
from atalaya_worker.store import Job

CSV = b"a,b\n1,2\n"
FILE_NAME = "0123456789abcdef0123456789abcdef"


def job_for(data: bytes, **over) -> Job:
    base = {
        "id": "u1",
        "kind": "csv",
        "sha256": hashlib.sha256(data).hexdigest(),
        "size_bytes": len(data),
        "storage_key": FILE_NAME,
    }
    return Job(**{**base, **over})


@pytest.fixture
def folder(tmp_path):
    (tmp_path / FILE_NAME).write_bytes(CSV)
    return str(tmp_path)


def test_a_good_file_passes(folder):
    assert review.review(folder, job_for(CSV)) is None


def test_the_worker_does_not_trust_the_api(folder, tmp_path):
    assert review.review(folder, job_for(CSV, sha256="0" * 64)) == "corrupt"  # los bytes no son los guardados
    assert review.review(folder, job_for(CSV, size_bytes=99)) == "corrupt"  # tamaño distinto
    assert review.review(folder, job_for(CSV, kind="xlsx")) == "corrupt"  # firma distinta a la anotada
    assert review.review(folder, job_for(CSV, storage_key="../../etc/passwd")) == "corrupt"  # llave con forma inválida
    assert review.review(folder, job_for(CSV, storage_key="f" * 32)) == "corrupt"  # el archivo no existe


def test_a_symlink_in_place_of_the_file_is_not_followed(tmp_path):
    secret = tmp_path / "secreto"
    secret.write_bytes(CSV)
    os.symlink(secret, tmp_path / FILE_NAME)
    assert review.review(str(tmp_path), job_for(CSV)) == "corrupt"


def test_a_review_that_takes_too_long_is_cut_with_worker_timeout(folder, monkeypatch):
    monkeypatch.setattr(review, "SECONDS_PER_FILE", 1)
    monkeypatch.setattr(review, "inspect_csv", lambda _data: [None for _ in iter(int, 1)])  # bucle infinito
    assert review.review(folder, job_for(CSV)) == "worker_timeout"


class FakeQueue:
    def __init__(self):
        self.acked = []

    def xack(self, stream, group, message_id):
        self.acked.append((stream, group, message_id))


class FakeDb:
    def __init__(self, claimed):
        self.claimed, self.finished = claimed, []

    def claim(self, _upload_id):
        if isinstance(self.claimed, Exception):
            raise self.claimed
        return self.claimed

    def finish(self, upload_id, reason):
        self.finished.append((upload_id, reason))


def run(db, monkeypatch, outcome="__ok__"):
    queue = FakeQueue()
    if outcome != "__ok__":
        monkeypatch.setattr(jobs, "review", outcome if callable(outcome) else (lambda *_: outcome))
    jobs.handle(queue, db, "/x", "1-0", "u1")
    return queue


def test_nothing_to_do_still_acks(monkeypatch):
    queue = run(FakeDb(None), monkeypatch)
    assert queue.acked == [(jobs.STREAM, jobs.GROUP, "1-0")]


def test_a_review_result_is_saved_and_acked(monkeypatch):
    db = FakeDb((job_for(CSV), False))
    assert run(db, monkeypatch, "empty").acked
    assert db.finished == [("u1", "empty")]
    db = FakeDb((job_for(CSV), False))
    run(db, monkeypatch, None)
    assert db.finished == [("u1", None)]  # None = accepted


def test_a_file_that_already_killed_the_worker_is_not_opened_again(monkeypatch):
    def boom(*_):
        raise AssertionError("no debe revisarse")

    db = FakeDb((job_for(CSV), True))
    run(db, monkeypatch, boom)
    assert db.finished == [("u1", "worker_timeout")]


def test_an_unexpected_error_does_not_leave_the_file_in_checking(monkeypatch):
    def boom(*_):
        raise MemoryError

    db = FakeDb((job_for(CSV), False))
    run(db, monkeypatch, boom)
    assert db.finished == [("u1", "corrupt")]


def test_a_database_error_is_not_acked_so_it_is_retried(monkeypatch):
    queue = FakeQueue()
    with pytest.raises(RuntimeError):
        jobs.handle(queue, FakeDb(RuntimeError("bd caída")), "/x", "1-0", "u1")
    assert queue.acked == []
