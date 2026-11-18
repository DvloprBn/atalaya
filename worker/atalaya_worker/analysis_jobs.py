"""Un trabajo de análisis, de punta a punta. El mensaje trae SOLO el id; el ESTADO dice qué toca hacer:

previewing → leer el archivo y dejar la VISTA PREVIA (columnas, ejemplos, mapeo sugerido)
queued     → con el mapeo que confirmó la persona: limpiar, dejar el informe y los dos CSV
running    → ya lo tomó alguien (o murió a la mitad): no se repite
"""

import logging
from pathlib import Path

import psycopg
import redis

from .analysis_store import AnalysisStore, AnalysisWork
from .cleaner import check_mapping, clean
from .export import write_clean, write_report
from .failure import AnalysisFail
from .limits import SECONDS_PER_ANALYSIS
from .preview import build_preview
from .queues import ANALYSIS_STREAM, GROUP
from .review import load_verified
from .tabular import read_table
from .timelimit import time_limit
from .verdict import Reject

log = logging.getLogger("atalaya.worker.analysis")
STARTED_TTL_SECONDS = 900


def _table(uploads_dir: str, work: AnalysisWork):
    if work.upload_status != "accepted":
        raise AnalysisFail("unreadable")
    try:
        data = load_verified(uploads_dir, work.upload)  # mismos bytes que la API guardó y que la revisión profunda aprobó
    except Reject:
        raise AnalysisFail("unreadable") from None
    return read_table(data, work.upload.kind)


def _preview(store: AnalysisStore, uploads_dir: str, work: AnalysisWork) -> None:
    store.save_preview(work.id, build_preview(_table(uploads_dir, work)))  # 0 filas = lo borraron: no hay nada que tirar


def _clean(store: AnalysisStore, uploads_dir: str, results_dir: str, work: AnalysisWork) -> None:
    table = _table(uploads_dir, work)
    mapping = work.mapping or {}
    check_mapping(mapping, len(table.header))
    rows, report = clean(table, mapping)
    mapped = {f for f in ("date", "amount", "quantity", "product", "branch", "orderId") if mapping.get(f) is not None}
    write_clean(results_dir, work.result_key, rows, mapped)
    write_report(results_dir, work.result_key, report)
    if not store.save_report(work.id, report):
        _discard(results_dir, work.result_key)  # el análisis se borró mientras trabajábamos: no dejar archivos huérfanos


def _discard(results_dir: str, key: str) -> None:
    """Borra lo que ESTE worker escribió (puede: es dueño de sus archivos; lo ajeno, el sticky bit no se lo permite)."""
    for kind in ("clean", "report"):
        for suffix in ("", ".tmp"):
            Path(results_dir, f"{key}.{kind}.csv{suffix}").unlink(missing_ok=True)


def _process(queue: redis.Redis, store: AnalysisStore, uploads_dir: str, results_dir: str, work: AnalysisWork) -> None:
    if work.status == "running":  # una ejecución anterior murió a la mitad: no se repite
        store.fail(work.id, "worker_timeout")
        return _discard(results_dir, work.result_key)
    stage = "preview" if work.status == "previewing" else "clean"
    # Marca de «esta etapa ya empezó» (SET NX: solo gana el primero). Si el mensaje VUELVE y la marca ya existe, la
    # ejecución anterior murió a la mitad: un archivo que ya mató al worker una vez no se reabre.
    first = queue.set(f"atalaya:worker:started:{work.id}:{stage}", "1", nx=True, ex=STARTED_TTL_SECONDS)
    if not first:
        store.fail(work.id, "worker_timeout")
        return _discard(results_dir, work.result_key)
    if stage == "clean" and not store.claim_running(work.id):
        return  # otro la tomó, o se borró

    try:
        with time_limit(SECONDS_PER_ANALYSIS):
            if stage == "preview":
                _preview(store, uploads_dir, work)
            else:
                _clean(store, uploads_dir, results_dir, work)
    except AnalysisFail as failed:
        store.fail(work.id, failed.reason)
    except TimeoutError:
        store.fail(work.id, "worker_timeout")
    except psycopg.Error, redis.RedisError:
        raise  # un fallo de infraestructura no es culpa del archivo: no se confirma, se reintenta
    except Exception as error:  # noqa: BLE001 - un fallo inesperado NO deja el análisis a medias
        log.error("fallo inesperado en un análisis: %s", type(error).__name__)
        store.fail(work.id, "unreadable")
    else:
        return
    _discard(results_dir, work.result_key)  # si falló, no queda ningún CSV a medias


def handle_analysis(
    queue: redis.Redis, store: AnalysisStore, uploads_dir: str, results_dir: str, message_id: str, analysis_id: str
) -> None:
    work = store.load(analysis_id) if analysis_id else None
    if work is None:
        log.info("mensaje sin trabajo (ya resuelto, borrado o inválido)")
    else:
        _process(queue, store, uploads_dir, results_dir, work)
    queue.xack(ANALYSIS_STREAM, GROUP, message_id)
