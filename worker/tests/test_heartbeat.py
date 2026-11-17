from datetime import UTC, datetime

from atalaya_worker.heartbeat import HEARTBEAT_KEY, HEARTBEAT_TTL_SECONDS, beat


class FakeStore:
    """Doble de Redis: guarda las llamadas para revisarlas."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, int]] = []

    def set(self, name: str, value: str, ex: int) -> bool:
        self.calls.append((name, value, ex))
        return True


def test_beat_writes_the_key_the_api_reads_with_its_ttl():
    store = FakeStore()
    beat(store, now=datetime(2026, 11, 17, 12, 0, tzinfo=UTC))
    assert store.calls == [(HEARTBEAT_KEY, "2026-11-17T12:00:00+00:00", HEARTBEAT_TTL_SECONDS)]


def test_key_matches_the_api_contract():
    # La API busca exactamente esta llave (api/src/health/health.service.ts).
    assert HEARTBEAT_KEY == "atalaya:worker:heartbeat"
