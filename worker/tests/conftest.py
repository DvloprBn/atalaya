"""Fábricas de archivos de prueba: se construyen aquí, en memoria; no hay archivos binarios en el repo."""

import io
import zipfile

import pytest

CONTENT_TYPES = "[Content_Types].xml"
NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'


def sheet_xml(rows: int = 3, cols: int = 2, dimension: str | None = None) -> str:
    dim = f'<dimension ref="{dimension}"/>' if dimension else ""
    body = "".join(
        f'<row r="{r}">' + "".join(f'<c r="{chr(64 + c)}{r}"><v>{r}</v></c>' for c in range(1, cols + 1)) + "</row>"
        for r in range(1, rows + 1)
    )
    return f'<?xml version="1.0"?><worksheet {NS}>{dim}<sheetData>{body}</sheetData></worksheet>'


def make_zip(entries: dict[str, str | bytes], *, deflate: bool = True) -> bytes:
    buf = io.BytesIO()
    method = zipfile.ZIP_DEFLATED if deflate else zipfile.ZIP_STORED
    with zipfile.ZipFile(buf, "w", method) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def make_xlsx(sheet: str | None = None, **extra: str | bytes) -> bytes:
    entries: dict[str, str | bytes] = {
        CONTENT_TYPES: "<Types/>",
        "xl/workbook.xml": "<workbook/>",
        "xl/worksheets/sheet1.xml": sheet if sheet is not None else sheet_xml(),
    }
    entries.update(extra)
    return make_zip(entries)


@pytest.fixture
def xlsx_factory():
    return make_xlsx


# ───────────────────────── CFDI sintéticos (RFC de pruebas del SAT; nada real) ─────────────────────────
CFDI_NS = {"3.3": "http://www.sat.gob.mx/cfd/3", "4.0": "http://www.sat.gob.mx/cfd/4"}
TFD_NS = "http://www.sat.gob.mx/TimbreFiscalDigital"
DEFAULT_CONCEPTS = (
    ("Latte", "2", "104.00", "0.00", "16.64"),
    ("Croissant", "1", "42.00", "2.00", "6.40"),
)  # (desc, cant, importe, descuento, iva)


def make_cfdi(
    version="4.0", tipo="I", moneda="MXN", fecha="2026-03-15T10:30:00", concepts=DEFAULT_CONCEPTS,
    uuid="6f0c1a9e-0b1d-4a52-9d2a-0123456789ab", serie="A", folio="1", doctype="", declaration='<?xml version="1.0" encoding="UTF-8"?>', body_extra="",
) -> bytes:  # fmt: skip
    """Un CFDI mínimo pero con la forma real (emisor, receptor, conceptos con su IVA y el timbre)."""
    ns = CFDI_NS[version] if version in CFDI_NS else CFDI_NS["4.0"]
    items = "".join(
        f'<cfdi:Concepto ClaveProdServ="90101501" Cantidad="{q}" ClaveUnidad="H87" Descripcion="{d}" ValorUnitario="1.00" Importe="{i}"'
        + (f' Descuento="{dc}"' if dc else "")
        + ' ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados>'
        f'<cfdi:Traslado Base="{i}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="{iva}"/>'
        f'<cfdi:Traslado Base="{i}" Impuesto="003" TipoFactor="Tasa" TasaOCuota="0.080000" Importe="9.99"/>'  # IEPS: NO es IVA
        "</cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>"
        for d, q, i, dc, iva in concepts
    )
    return (
        f'{declaration}{doctype}<cfdi:Comprobante xmlns:cfdi="{ns}" xmlns:tfd="{TFD_NS}" Version="{version}" Serie="{serie}" Folio="{folio}" '
        f'Fecha="{fecha}" TipoDeComprobante="{tipo}" Moneda="{moneda}" SubTotal="1.00" Total="1.00" LugarExpedicion="06600">'
        '<cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"/>'
        '<cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" UsoCFDI="S01"/>'
        f"<cfdi:Conceptos>{items}</cfdi:Conceptos>"
        f'<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="{uuid}" FechaTimbrado="{fecha}" SelloCFD="FAKE" NoCertificadoSAT="00000000000000000000"/></cfdi:Complemento>'
        f"{body_extra}</cfdi:Comprobante>"
    ).encode()  # fmt: skip


def make_cfdi_zip(entries: dict[str, bytes | str]) -> bytes:
    return make_zip(entries)
