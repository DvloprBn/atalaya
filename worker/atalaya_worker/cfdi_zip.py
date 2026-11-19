"""Un ZIP de comprobantes (como los baja el portal del SAT): la revisión de zip de v0.8 más la de cada XML.

Reglas del ZIP, además de las de `check_zip` (bomba, 500 entradas, sin cifrar, sin `..`, sin nombres repetidos):
  - toda entrada es un `.xml` (un ZIP dentro de un ZIP, una imagen o un PDF se rechazan);
  - cada XML pesa a lo más 1 MB, contando los bytes REALES que salen al descomprimir (la cabecera puede mentir);
  - UNA entrada mala rechaza TODO el ZIP: analizar a medias sin decirlo sería peor que pedir que se corrija.
"""

import io
import zipfile

from .cfdi import Document, parse_cfdi
from .inspect_xlsx import check_zip
from .limits import CHUNK, MAX_CFDI_BYTES, MAX_ROWS, MAX_UNCOMPRESSED_BYTES
from .verdict import Reject


def read_cfdi_zip(data: bytes) -> list[Document]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile, ValueError:
        raise Reject("corrupt") from None
    documents: list[Document] = []
    concepts = 0
    budget = MAX_UNCOMPRESSED_BYTES
    with archive:
        check_zip(archive, len(data))
        entries = [i for i in archive.infolist() if not i.is_dir()]
        if not entries:
            raise Reject("empty")
        for info in entries:
            if not info.filename.lower().endswith(".xml"):
                raise Reject("corrupt")  # solo XML: ni zips anidados ni nada más
            xml = bytearray()
            try:
                with archive.open(info) as stream:
                    while chunk := stream.read(CHUNK):
                        xml += chunk
                        budget -= len(chunk)
                        if budget < 0:
                            raise Reject("zip_bomb")
                        if len(xml) > MAX_CFDI_BYTES:
                            raise Reject("range_too_large")
            except zipfile.BadZipFile, EOFError, NotImplementedError, OSError:
                raise Reject("corrupt") from None
            document = parse_cfdi(bytes(xml))
            concepts += len(document.concepts)
            if concepts > MAX_ROWS:
                raise Reject("range_too_large")
            documents.append(document)
    return documents
