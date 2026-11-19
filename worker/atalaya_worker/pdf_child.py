"""El PROCESO HIJO que abre un PDF. Lo arranca pdf_reader.py con `python -I` y nada más se comunica con él por tuberías.

Por qué un proceso aparte (y no el SIGALRM de v0.8): un PDF hostil puede traer un flujo comprimido que crece a gigas
(se come la memoria ANTES de que suene la alarma) o un ciclo que no atiende señales. A un proceso hijo el núcleo le pone
topes que no se pueden esquivar (memoria y CPU), y si aun así se cuelga, el padre lo mata: el worker sigue vivo.

Este archivo NO importa nada del worker: `-I` deja fuera la carpeta del script y la actual, así que solo ve la
biblioteca estándar y las dependencias instaladas. Entra: los bytes del PDF por stdin y los topes en argv (JSON).
Sale: UNA línea JSON por stdout, `{"reject": motivo}` o `{"tables": [{"page": n, "rows": [[texto, …], …]}, …]}`.
Nunca escribe texto del archivo en stderr ni en un registro: el padre descarta stderr.
"""

import io
import json
import resource
import sys

# Lo que ejecuta código, abre programas o trae archivos adentro. Aquí se comparan los nombres YA interpretados
# (`/J#61vaScript` llega como `JavaScript`) y de TODOS los objetos, también los de flujos comprimidos.
ACTIVE = frozenset({"JavaScript", "JS", "Launch", "EmbeddedFile", "EmbeddedFiles", "RichMedia", "XFA"})


class Reject(Exception):  # noqa: N818 - es el resultado normal de revisar un archivo malo
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _limit_myself(limits: dict) -> None:
    """Lo PRIMERO que hace el hijo, antes de tocar el PDF: bajarse sus propios topes (después ya no puede subirlos)."""
    for which, value in (
        (resource.RLIMIT_AS, limits["memory"]),  # memoria: una bomba de descompresión da MemoryError aquí
        (resource.RLIMIT_CPU, limits["cpu"]),  # CPU: al pasarse, el núcleo manda SIGXCPU y el hijo muere
        (resource.RLIMIT_FSIZE, 0),  # no escribe archivos
        (resource.RLIMIT_CORE, 0),  # ni un volcado de memoria con el contenido del PDF
        (resource.RLIMIT_NOFILE, 32),  # ni abre muchos descriptores
    ):
        resource.setrlimit(which, (value, value))


def _names(obj: object, depth: int, limits: dict):
    """Todos los nombres de un objeto de PDF (claves y valores), sin seguir referencias: cada objeto se visita por su lado."""
    from pdfminer.pdftypes import PDFStream
    from pdfminer.psparser import PSLiteral

    if depth > limits["depth"]:
        raise Reject("range_too_large")
    if isinstance(obj, PSLiteral):
        yield obj.name.decode("latin-1") if isinstance(obj.name, bytes) else str(obj.name)
    elif isinstance(obj, PDFStream):
        yield from _names(obj.attrs, depth + 1, limits)  # el diccionario del flujo; los datos no se descomprimen aquí
    elif isinstance(obj, dict):
        for key, value in obj.items():
            yield str(key)
            yield from _names(value, depth + 1, limits)
    elif isinstance(obj, list):
        for value in obj:
            yield from _names(value, depth + 1, limits)


def check_document(data: bytes, limits: dict) -> None:
    """Cifrado y contenido activo, mirando el PDF ya interpretado: TODOS sus objetos y sus tráileres."""
    from pdfminer.pdfdocument import PDFDocument, PDFEncryptionError, PDFObjectNotFound
    from pdfminer.pdfparser import PDFParser

    try:
        doc = PDFDocument(PDFParser(io.BytesIO(data)))
    except PDFEncryptionError:  # cifrado con una contraseña que no es la vacía
        raise Reject("encrypted") from None
    if doc.encryption is not None:  # cifrado aunque se abra sin contraseña (solo «de propietario»): igual se rechaza
        raise Reject("encrypted")
    seen: set[int] = set()
    for xref in doc.xrefs:
        objects = [xref.get_trailer()]
        for objid in xref.get_objids():
            if objid in seen:
                continue
            seen.add(objid)
            if len(seen) > limits["objects"]:
                raise Reject("range_too_large")
            try:
                objects.append(doc.getobj(objid))
            except PDFObjectNotFound:  # una entrada del índice que no lleva a nada: no hay qué revisar
                continue
        for obj in objects:
            if any(name in ACTIVE for name in _names(obj, 0, limits)):
                raise Reject("active_content")


def _cell(value: object, limits: dict) -> str:
    return "" if value is None else str(value)[: limits["cell"]]


def extract_tables(data: bytes, limits: dict) -> list[dict]:
    """Las tablas CON LÍNEAS de cada página (la estrategia por omisión de pdfplumber). Una tabla sin líneas no se adivina."""
    import pdfplumber

    tables, any_text = [], False
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        if len(pdf.pages) > limits["pages"]:
            raise Reject("range_too_large")
        for number, page in enumerate(pdf.pages, start=1):
            any_text = any_text or bool(page.chars)
            for raw in page.extract_tables():
                rows = [[_cell(c, limits) for c in row] for row in raw]
                if len(rows) >= 2 and max(len(r) for r in rows) >= 2:
                    tables.append({"page": number, "rows": rows})
    if not any_text:
        raise Reject("no_text_layer")
    if not tables:
        raise Reject("no_table")
    return tables


def run(data: bytes, limits: dict) -> dict:
    if not data.startswith(b"%PDF-"):
        return {"reject": "corrupt"}
    try:
        check_document(data, limits)
        result = {"tables": extract_tables(data, limits)}
    except Reject as rejected:
        return {"reject": rejected.reason}
    except Exception as error:  # noqa: BLE001 - pdfminer lanza de todo con un PDF roto; para la persona es «está dañado»
        return {"reject": "range_too_large" if _too_big(error) else "corrupt"}
    return result


def _too_big(error: BaseException | None) -> bool:
    """¿Se agotó la memoria o la pila? pdfplumber ENVUELVE los errores de pdfminer (un `MemoryError` llega como
    `PdfminerException`), así que se recorre la cadena de causas. Lo atrapó una prueba con una bomba de 1 GB."""
    while error is not None:
        if isinstance(error, MemoryError | RecursionError):
            return True
        error = error.__cause__ or error.__context__
    return False


def main() -> None:
    limits = json.loads(sys.argv[1])
    _limit_myself(limits)
    out = json.dumps(run(sys.stdin.buffer.read(), limits), ensure_ascii=True)
    if len(out) > limits["output"]:
        out = json.dumps({"reject": "range_too_large"})
    sys.stdout.write(out + "\n")


if __name__ == "__main__":
    main()
