import socket
from decimal import Decimal

import pytest
from conftest import make_cfdi

from atalaya_worker import cfdi
from atalaya_worker.cfdi import parse_cfdi
from atalaya_worker.verdict import Reject


def reason_of(data: bytes) -> str | None:
    try:
        parse_cfdi(data)
    except Reject as rejected:
        return rejected.reason
    return None


class TestAValidComprobante:
    def test_reads_every_field_the_analysis_needs(self):
        doc = parse_cfdi(make_cfdi())
        assert (doc.version, doc.kind, doc.currency, doc.date) == ("4.0", "I", "MXN", "2026-03-15T10:30:00")
        assert (doc.issuer_rfc, doc.receiver_rfc, doc.folio) == ("EKU9003173C9", "XAXX010101000", "A1")
        assert doc.uuid == "6F0C1A9E-0B1D-4A52-9D2A-0123456789AB"  # el UUID se normaliza a mayúsculas
        assert [(c.description, c.quantity) for c in doc.concepts] == [("Latte", "2"), ("Croissant", "1")]

    def test_the_amount_is_importe_minus_descuento_in_exact_decimal(self):
        concepts = (("A", "1", "100.10", "0.20", "16.00"), ("B", "1", "0.30", "", "0.00"))
        assert [c.amount for c in parse_cfdi(make_cfdi(concepts=concepts)).concepts] == ["99.90", "0.30"]  # con float: 99.89999…

    def test_vat_is_only_the_iva_traslados_not_other_taxes(self):
        # make_cfdi pone en cada concepto un traslado de IVA (002) y otro de IEPS (003, 9.99): solo el primero es IVA.
        assert [c.vat for c in parse_cfdi(make_cfdi()).concepts] == ["16.64", "6.40"]

    def test_version_3_3_with_its_own_namespace(self):
        assert parse_cfdi(make_cfdi(version="3.3")).version == "3.3"

    def test_an_amount_that_is_not_a_number_travels_as_text_so_the_cleaner_counts_it(self):
        doc = parse_cfdi(make_cfdi(concepts=(("X", "1", "mucho", "", "0"),)))
        assert doc.concepts[0].amount == "mucho"


class TestNotACfdi:
    @pytest.mark.parametrize(
        "data",
        [
            b'<?xml version="1.0"?><nota>hola</nota>',
            b'<?xml version="1.0"?><Comprobante Version="4.0"/>',  # sin el espacio de nombres del SAT
            b'<c:Comprobante xmlns:c="http://example.com/otro" Version="4.0"/>',
            make_cfdi().replace(b'Version="4.0"', b'Version="3.2"'),
            make_cfdi().replace(b'Version="4.0"', b""),
            make_cfdi(version="3.3").replace(
                b'Version="3.3"', b'Version="4.0"'
            ),  # el espacio de nombres y la versión no concuerdan
            b'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>Comprobante</body></html>',
        ],
    )
    def test_is_not_cfdi(self, data):
        assert reason_of(data) == "not_cfdi"

    def test_a_comprobante_without_conceptos_is_not_one(self):
        assert reason_of(make_cfdi(concepts=())) == "not_cfdi"


class TestXXEAndItsRelatives:
    """El catálogo del ataque. TODO sale como `corrupt` porque `defusedxml` prohíbe el DOCTYPE entero: un CFDI nunca lo lleva."""

    ATTACKS = {
        "entidad externa: lee un archivo del servidor": '<!DOCTYPE c [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
        "entidad externa: SSRF a un servicio interno": '<!DOCTYPE c [<!ENTITY x SYSTEM "http://169.254.169.254/latest/meta-data/">]>',
        "billion laughs": '<!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>',
        "quadratic blowup: una entidad grande repetida": '<!DOCTYPE q [<!ENTITY big "' + "A" * 5000 + '">]>',
        "DTD externo": '<!DOCTYPE c SYSTEM "http://127.0.0.1:9/evil.dtd">',
        "entidad de parámetro externa": '<!DOCTYPE c [<!ENTITY % p SYSTEM "http://127.0.0.1:9/p.dtd"> %p;]>',
        "DOCTYPE vacío, sin ninguna entidad": "<!DOCTYPE c []>",
        "DOCTYPE con PUBLIC": '<!DOCTYPE c PUBLIC "-//X//EN" "http://127.0.0.1:9/x.dtd">',
    }

    @pytest.mark.parametrize("name", ATTACKS)
    def test_every_attack_is_rejected_as_corrupt(self, name):
        assert reason_of(make_cfdi(doctype=self.ATTACKS[name])) == "corrupt"

    @pytest.mark.parametrize(
        "name", ["entidad externa: lee un archivo del servidor", "DTD externo", "entidad de parámetro externa"]
    )
    def test_the_parser_never_touches_the_network_while_rejecting(self, name, monkeypatch):
        def no_network(*_args, **_kwargs):
            raise AssertionError("el parser intentó abrir una conexión")

        monkeypatch.setattr(socket.socket, "connect", no_network)
        assert reason_of(make_cfdi(doctype=self.ATTACKS[name])) == "corrupt"

    def test_an_entity_reference_without_declaring_it_is_just_broken_xml(self):
        assert reason_of(make_cfdi(body_extra="&x;")) == "corrupt"

    def test_xinclude_is_never_processed_and_does_not_read_files(self):
        extra = '<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="file:///etc/passwd" parse="text"/>'
        doc = parse_cfdi(make_cfdi(body_extra=extra))  # ElementTree no procesa XInclude: es un elemento más, y se ignora
        assert [c.description for c in doc.concepts] == ["Latte", "Croissant"]

    def test_a_processing_instruction_that_points_to_a_stylesheet_is_ignored(self):
        doc = parse_cfdi(
            make_cfdi(declaration='<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="http://127.0.0.1:9/x.xsl"?>')
        )
        assert len(doc.concepts) == 2


class TestLimits:
    def test_too_big(self):
        assert reason_of(make_cfdi(body_extra="<!--" + "x" * (1024 * 1024) + "-->")) == "range_too_large"

    def test_too_deep(self):
        deep = "<a>" * 25 + "</a>" * 25
        assert reason_of(make_cfdi(body_extra=deep)) == "range_too_large"
        assert reason_of(make_cfdi(body_extra="<a>" * 5 + "</a>" * 5)) is None  # la profundidad normal sigue pasando

    def test_too_many_elements(self, monkeypatch):
        monkeypatch.setattr(cfdi, "MAX_XML_ELEMENTS", 50)
        assert reason_of(make_cfdi(body_extra="<a/>" * 60)) == "range_too_large"

    def test_a_giant_attribute(self):
        assert reason_of(make_cfdi(body_extra=f'<a v="{"x" * 4001}"/>')) == "range_too_large"
        assert reason_of(make_cfdi(body_extra=f'<a v="{"x" * 3000}"/>')) is None

    def test_too_many_conceptos(self, monkeypatch):
        monkeypatch.setattr(cfdi, "MAX_ROWS", 3)
        many = tuple((f"c{n}", "1", "1.00", "", "0.16") for n in range(4))
        assert reason_of(make_cfdi(concepts=many)) == "range_too_large"
        assert reason_of(make_cfdi(concepts=many[:3])) is None

    @pytest.mark.parametrize(
        "data",
        [
            b"",
            b"no es xml",
            b"<Comprobante",  # cortado
            b"\xff\xfe<\x00?\x00x\x00m\x00l\x00",  # UTF-16 con BOM
            b"\xfe\xff\x00<\x00?\x00x\x00m\x00l",
            make_cfdi(declaration='<?xml version="1.0" encoding="ISO-8859-1"?>'),  # un CFDI del SAT es UTF-8
            make_cfdi(declaration='<?xml version="1.0" encoding="UTF-7"?>'),
            make_cfdi().replace(b"PUBLICO", b"P\xdaBLICO"),  # un byte suelto que no es UTF-8
        ],
    )
    def test_not_well_formed_utf8_xml_is_corrupt(self, data):
        assert reason_of(data) == "corrupt"

    def test_utf8_with_or_without_bom_and_declaration_is_fine(self):
        assert reason_of(b"\xef\xbb\xbf" + make_cfdi()) is None
        assert reason_of(make_cfdi(declaration="")) is None
        assert reason_of(make_cfdi(declaration='<?xml version="1.0" encoding="utf-8"?>')) is None
        assert (
            parse_cfdi(make_cfdi(concepts=(("Café con leche ñandú", "1", "10.00", "", "1.60"),))).concepts[0].description
            == "Café con leche ñandú"
        )

    def test_the_money_is_decimal_not_float(self):
        assert Decimal(parse_cfdi(make_cfdi(concepts=(("x", "1", "0.30", "0.10", "0"),))).concepts[0].amount) == Decimal("0.20")
