"""v0.12: el PDF hostil y el tiempo límite. El hijo REAL contra PDF armados a mano, y el padre contra hijos falsos
(que se cuelgan, gastan CPU, mueren o contestan basura) para probar cada forma de terminar sin esperar 15 s."""

import json
import time

import pytest
from pdf_maker import VENTAS, bomb_stream, make_pdf, object_stream, owner_only_encryption

from atalaya_worker import pdf_reader
from atalaya_worker.pdf_reader import _run_child, _tables, inspect_pdf
from atalaya_worker.verdict import Reject


def reason(data: bytes) -> str | None:
    try:
        inspect_pdf(data)
    except Reject as rejected:
        return rejected.reason
    return None


TABLE = [("table", VENTAS)]
ZEROS = "00" * 32
ENCRYPT = f"/Encrypt << /Filter /Standard /V 1 /R 2 /O <{ZEROS}> /U <{ZEROS}> /P -4 >> /ID [<00> <00>]"


class TestTheRealChild:
    def test_a_report_with_a_ruled_table_passes_and_comes_back_cell_by_cell(self):
        answer = _run_child(make_pdf([[("text", "Reporte de ventas"), ("table", VENTAS)]]))
        assert answer == {"tables": [{"page": 1, "rows": VENTAS}]}  # acentos incluidos («Café de olla»)

    @pytest.mark.parametrize(
        ("name", "pdf", "expected"),
        [
            ("un escaneo: solo dibujo, sin texto", make_pdf([[("lines",)]]), "no_text_layer"),
            ("texto suelto sin ninguna tabla", make_pdf([[("text", "Hola"), ("text", "Sin tabla")]]), "no_table"),
            ("una tabla de una sola columna no cuenta", make_pdf([[("table", [["a"], ["b"], ["c"]])]]), "no_table"),
            (
                "JavaScript a la vista",
                make_pdf([TABLE], catalog_extra="/OpenAction << /S /JavaScript /JS (x) >>"),
                "active_content",
            ),
            (
                "JavaScript con escapes (#61 = a)",
                make_pdf([TABLE], catalog_extra="/OpenAction << /S /J#61vaScript >>"),
                "active_content",
            ),
            (
                "abrir otro programa",
                make_pdf([TABLE], catalog_extra="/OpenAction << /S /Launch /F (calc.exe) >>"),
                "active_content",
            ),
            (
                "un archivo incrustado",
                make_pdf([TABLE], catalog_extra="/Names << /EmbeddedFiles << /Names [] >> >>"),
                "active_content",
            ),
            ("un formulario XFA", make_pdf([TABLE], catalog_extra="/AcroForm << /XFA [] /Fields [] >>"), "active_content"),
            (
                "JavaScript dentro de un flujo de objetos COMPRIMIDO",
                make_pdf([TABLE], extra_objects=[object_stream(b"<< /S /JavaScript /JS (x) >>", 99)], with_xref=False),
                "active_content",
            ),
            (
                "cifrado con una contraseña que no es la vacía",
                make_pdf([TABLE], trailer_extra=ENCRYPT),
                "encrypted",
            ),
            (
                # Se abre SIN contraseña (cifrado solo «de propietario») y aun así se rechaza. Una falla sembrada que
                # quitaba esta revisión sobrevivía con el caso de arriba, que nunca llegaba hasta aquí.
                "cifrado aunque se abra sin contraseña",
                make_pdf([TABLE], trailer_extra=owner_only_encryption()),
                "encrypted",
            ),
            ("51 páginas", make_pdf([[("text", "x")]] * 51), "range_too_large"),
            (
                "diccionarios anidados 40 niveles",
                make_pdf([TABLE], catalog_extra="/X " + "<< /Y " * 40 + "1" + " >>" * 40),
                "range_too_large",
            ),
            ("la firma y luego basura", b"%PDF-1.7\nbasura basura basura", "corrupt"),
            ("sin firma de PDF", b"fecha,total\n2026-03-01,10\n", "corrupt"),
        ],
    )
    def test_hostile_or_unusable_pdfs_are_rejected_with_a_closed_reason(self, name, pdf, expected):
        assert reason(pdf) == expected, name

    def test_a_decompression_bomb_hits_the_memory_cap_and_the_worker_lives_on(self):
        # ~500 KB que se descomprimen a 512 MB, por encima de los 384 MB del hijo. Lo atrapó esta prueba: pdfplumber
        # ENVUELVE el MemoryError y salía como `corrupt` hasta que el hijo aprendió a mirar la cadena de causas.
        started = time.monotonic()
        assert reason(make_pdf([TABLE], raw_content=bomb_stream(512))) == "range_too_large"
        assert time.monotonic() - started < 10
        assert reason(make_pdf([TABLE])) is None  # y el siguiente archivo se lee normal


def fake_child(tmp_path, monkeypatch, body: str, *, wall: int = 15, cpu: int = 15):
    """Reemplaza el script del hijo por uno de prueba (con los mismos argumentos y el mismo aislamiento)."""
    script = tmp_path / "hijo_falso.py"
    script.write_text("import json, os, sys, time\n" + body)
    monkeypatch.setattr(pdf_reader, "_CHILD", str(script))
    monkeypatch.setattr(pdf_reader, "PDF_WALL_SECONDS", wall)
    monkeypatch.setattr(pdf_reader, "_LIMITS", json.dumps({**json.loads(pdf_reader._LIMITS), "cpu": cpu}))


class TestTheParentDecides:
    def test_a_child_that_hangs_is_killed_by_the_wall_clock(self, tmp_path, monkeypatch):
        fake_child(tmp_path, monkeypatch, "time.sleep(60)", wall=1)
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            _run_child(b"%PDF-1.7")
        assert time.monotonic() - started < 5

    def test_a_child_that_burns_cpu_is_killed_by_the_kernel(self, tmp_path, monkeypatch):
        # El hijo falso se pone su tope de CPU igual que el real; el núcleo lo mata con SIGXCPU antes que el reloj.
        body = "import resource\nc = json.loads(sys.argv[1])['cpu']\nresource.setrlimit(resource.RLIMIT_CPU, (c, c))\nwhile True: pass"
        fake_child(tmp_path, monkeypatch, body, wall=10, cpu=1)
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            _run_child(b"%PDF-1.7")
        assert time.monotonic() - started < 5

    @pytest.mark.parametrize(
        "body",
        [
            "os.abort()",  # muere por una falla (como un error dentro de código nativo)
            "print('esto no es json')",
            "print(json.dumps([1, 2]))",
            "print(json.dumps({'reject': 'cualquier cosa'}))",  # un motivo que no es de la lista cerrada
            "print(json.dumps({'tables': [{'page': 1, 'rows': [[1, 2]]}]}))",  # celdas que no son texto
            "print(json.dumps({'tables': []}))",
            "print(json.dumps({'tables': [{'page': 1, 'rows': [['a']]}]})); sys.exit(3)",  # contestó pero terminó mal
        ],
    )
    def test_any_answer_without_the_right_shape_is_corrupt(self, tmp_path, monkeypatch, body):
        fake_child(tmp_path, monkeypatch, body)
        with pytest.raises(Reject) as info:
            _tables(_run_child(b"%PDF-1.7"))
        assert info.value.reason == "corrupt"

    def test_the_child_inherits_nothing_from_the_worker(self, tmp_path, monkeypatch):
        # El worker tiene en su entorno las URLs de la base y de Redis con sus contraseñas: el hijo no debe verlas.
        monkeypatch.setenv("DATABASE_URL", "postgresql://worker:secreto@db/atalaya")
        body = "print(json.dumps({'tables': [{'page': 1, 'rows': [sorted(os.environ), [os.getcwd()], sys.path[:1]]}]}))"
        fake_child(tmp_path, monkeypatch, body)
        rows = _run_child(b"%PDF-1.7")["tables"][0]["rows"]
        assert [k for k in rows[0] if k != "LC_CTYPE"] == []  # Python puede fijar LC_CTYPE por su cuenta; nada más
        assert rows[1] == ["/"]
        assert str(tmp_path) not in rows[2][0]  # -I: la carpeta del script no entra en la ruta de imports

    def test_too_many_rows_or_columns_are_too_large(self):
        with pytest.raises(Reject) as info:
            _tables({"tables": [{"page": 1, "rows": [["a", "b"]] * 50_001}]})
        assert info.value.reason == "range_too_large"
        with pytest.raises(Reject) as info:
            _tables({"tables": [{"page": 1, "rows": [["x"] * 201, ["y"] * 201]}]})
        assert info.value.reason == "range_too_large"
