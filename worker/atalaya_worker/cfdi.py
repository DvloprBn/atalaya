"""Leer UN comprobante CFDI (3.3 o 4.0) de un desconocido. El riesgo de un XML ajeno es el XXE y sus parientes:

  - entidad EXTERNA (`<!ENTITY x SYSTEM "file:///etc/passwd">`): lee archivos del servidor;
  - entidades que se MULTIPLICAN («billion laughs») o una grande repetida («quadratic blowup»): agotan la memoria;
  - DTD EXTERNO o entidad de parámetro: hacen que el parser salga a la red (SSRF);
  - XML enorme, anidado a mil niveles o con millones de elementos: agotan memoria o pila.

La defensa de fondo es una sola: **un CFDI no lleva DOCTYPE**, así que `defusedxml` lo prohíbe (DTD, entidades y referencias
externas) y TODO eso falla en el primer paso. Lo demás son topes que se aplican MIENTRAS se lee, sin construir el árbol
entero primero. Y el worker no tiene red: si algo lograra salir a buscar una URL, no hay a dónde ir (segunda barrera).

NO se valida la firma (`Sello`, `Certificado`, el timbre del SAT), ni el estatus del comprobante, ni que el IVA cuadre:
esto es analítica de lo que el archivo dice, no una herramienta fiscal.
"""

import io
import re
from dataclasses import dataclass, field
from decimal import Decimal

from defusedxml import DefusedXmlException
from defusedxml.ElementTree import ParseError, iterparse

from .limits import MAX_ATTR_CHARS, MAX_CFDI_BYTES, MAX_ROWS, MAX_XML_DEPTH, MAX_XML_ELEMENTS
from .verdict import Reject

NS_BY_VERSION = {"3.3": "http://www.sat.gob.mx/cfd/3", "4.0": "http://www.sat.gob.mx/cfd/4"}
TFD = "http://www.sat.gob.mx/TimbreFiscalDigital"
_ENCODING = re.compile(rb"^\s*<\?xml[^>]*?encoding\s*=\s*[\"']([^\"']+)[\"']", re.IGNORECASE)
_BOMS = (b"\xff\xfe", b"\xfe\xff", b"\x00\x00\xfe\xff", b"\xff\xfe\x00\x00")  # UTF-16 y UTF-32
_MONEY = re.compile(r"\d{1,15}(\.\d{1,6})?")


@dataclass
class Concept:
    description: str
    quantity: str
    amount: str  # Importe menos Descuento, como texto decimal exacto (o el texto original si no se pudo leer)
    vat: str  # suma de los traslados de IVA del concepto


@dataclass
class Document:
    version: str
    date: str
    kind: str  # TipoDeComprobante: I, E, P, T, N
    currency: str
    uuid: str
    folio: str
    issuer_rfc: str
    issuer_name: str
    receiver_rfc: str
    receiver_name: str
    concepts: list[Concept] = field(default_factory=list)


def _decimal(text: str | None) -> Decimal | None:
    return Decimal(text) if text is not None and _MONEY.fullmatch(text) else None


def _split(tag: str) -> tuple[str, str]:
    """`{espacio}Nombre` → (espacio, Nombre)."""
    if not tag.startswith("{"):
        return "", tag
    namespace, _, local = tag[1:].partition("}")
    return namespace, local


def _parse_tree(data: bytes):
    """El árbol del XML, con topes de tamaño, profundidad, elementos y largo de atributos aplicados MIENTRAS se lee."""
    if len(data) > MAX_CFDI_BYTES:
        raise Reject("range_too_large")
    if data.startswith(_BOMS):
        raise Reject("corrupt")  # un CFDI del SAT es UTF-8
    declared = _ENCODING.match(data[:300])
    if declared and declared.group(1).decode("ascii", "replace").lower().replace("_", "-") not in ("utf-8", "utf8"):
        raise Reject("corrupt")
    depth = elements = 0
    root = None
    try:
        # forbid_dtd=True: CUALQUIER <!DOCTYPE> falla aquí, con o sin entidades. Es la defensa contra todo el catálogo de XXE.
        for event, element in iterparse(io.BytesIO(data), events=("start", "end"), forbid_dtd=True):
            if event == "end":
                depth -= 1
                continue
            depth += 1
            elements += 1
            if root is None:
                root = element
            if depth > MAX_XML_DEPTH or elements > MAX_XML_ELEMENTS:
                raise Reject("range_too_large")
            if any(len(v) > MAX_ATTR_CHARS for v in element.attrib.values()):
                raise Reject("range_too_large")
    except ParseError, DefusedXmlException, UnicodeError, ValueError:
        raise Reject("corrupt") from None
    if root is None:
        raise Reject("corrupt")
    return root


def parse_cfdi(data: bytes) -> Document:
    """Un comprobante, o `Reject` con un motivo de lista cerrada: corrupt (XML roto o con DOCTYPE), not_cfdi o range_too_large."""
    root = _parse_tree(data)
    namespace, local = _split(root.tag)
    version = root.get("Version") or root.get("version") or ""
    if local != "Comprobante" or NS_BY_VERSION.get(version) != namespace:  # espacio de nombres y versión deben concordar
        raise Reject("not_cfdi")

    def child(parent, name: str, ns: str = namespace):
        return parent.find(f"{{{ns}}}{name}") if parent is not None else None

    def attr(element, name: str) -> str:
        return element.get(name, "") if element is not None else ""

    issuer, receiver = child(root, "Emisor"), child(root, "Receptor")
    stamp = child(child(root, "Complemento"), "TimbreFiscalDigital", TFD)
    document = Document(
        version=version, date=attr(root, "Fecha"), kind=attr(root, "TipoDeComprobante"), currency=attr(root, "Moneda"),
        uuid=attr(stamp, "UUID").upper(), folio=f"{attr(root, 'Serie')}{attr(root, 'Folio')}",
        issuer_rfc=attr(issuer, "Rfc"), issuer_name=attr(issuer, "Nombre"),
        receiver_rfc=attr(receiver, "Rfc"), receiver_name=attr(receiver, "Nombre"),
    )  # fmt: skip
    concepts = child(root, "Conceptos")
    found = concepts.findall(f"{{{namespace}}}Concepto") if concepts is not None else []
    if not found:
        raise Reject("not_cfdi")  # un CFDI sin conceptos no es un comprobante
    if len(found) > MAX_ROWS:
        raise Reject("range_too_large")
    for c in found:
        amount, discount = _decimal(c.get("Importe")), _decimal(c.get("Descuento") or "0")
        net = (amount - discount) if amount is not None and discount is not None else None
        vat = sum(
            (_decimal(t.get("Importe")) or Decimal(0)
             for t in c.findall(f"{{{namespace}}}Impuestos/{{{namespace}}}Traslados/{{{namespace}}}Traslado")
             if t.get("Impuesto") == "002"),
            Decimal(0),
        )  # fmt: skip
        document.concepts.append(
            Concept(
                c.get("Descripcion", ""),
                c.get("Cantidad", ""),
                format(net, "f") if net is not None else c.get("Importe", ""),
                format(vat, "f"),
            )
        )
    return document
