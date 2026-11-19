"""Un generador de PDF mínimo para las pruebas: tablas con líneas, texto suelto y las piezas de los PDF hostiles.

Se escribe a mano (y no con una biblioteca) para controlar cada byte: un PDF hostil es justo un PDF «casi normal».
Cada página es una lista de bloques: `("table", filas)` dibuja una tabla con sus líneas, `("text", línea)` escribe texto
sin líneas, y `("lines",)` solo dibuja (una página sin texto, como un escaneo).
"""

import zlib

W, H, LEFT, ROW = 612, 792, 50, 20


def _esc(text: str) -> bytes:
    raw = text.encode("cp1252")  # la codificación WinAnsi de la fuente (acentos y ñ incluidos)
    return raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")


def _table(rows: list[list[str]], top: float) -> tuple[bytes, float]:
    cols = max(len(r) for r in rows)
    width = (W - 2 * LEFT) / cols
    out = [b"0.5 w"]
    bottom = top - ROW * len(rows)
    for i in range(len(rows) + 1):  # líneas horizontales
        y = top - i * ROW
        out.append(b"%.1f %.1f m %.1f %.1f l S" % (LEFT, y, W - LEFT, y))
    for j in range(cols + 1):  # líneas verticales
        x = LEFT + j * width
        out.append(b"%.1f %.1f m %.1f %.1f l S" % (x, top, x, bottom))
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            x, y = LEFT + j * width + 4, top - (i + 1) * ROW + 6
            out.append(b"BT /F1 9 Tf %.1f %.1f Td (%s) Tj ET" % (x, y, _esc(cell)))
    return b"\n".join(out), bottom - 30


def _content(blocks: list[tuple]) -> bytes:
    parts, top = [], H - 50
    for block in blocks:
        if block[0] == "table":
            drawn, top = _table(block[1], top)
            parts.append(drawn)
        elif block[0] == "text":
            parts.append(b"BT /F1 11 Tf %d %.1f Td (%s) Tj ET" % (LEFT, top, _esc(block[1])))
            top -= 20
        elif block[0] == "lines":
            parts.append(b"1 w 50 700 m 500 700 l S 50 600 m 500 600 l S 50 600 m 50 700 l S")
    return b"\n".join(parts)


def _stream(data: bytes, compress: bool) -> bytes:
    if compress:
        data = zlib.compress(data)
        return b"<< /Length %d /Filter /FlateDecode >>\nstream\n%s\nendstream" % (len(data), data)
    return b"<< /Length %d >>\nstream\n%s\nendstream" % (len(data), data)


def make_pdf(
    pages: list[list[tuple]],
    *,
    catalog_extra: str = "",
    trailer_extra: str = "",
    compress: bool = True,
    extra_objects: list[bytes] | None = None,
    raw_content: bytes | None = None,
    with_xref: bool = True,
) -> bytes:
    """Un PDF válido. `extra_objects` se suman tal cual (numerados después de las páginas); `raw_content` reemplaza el
    flujo de la primera página (ya armado, con su diccionario); `with_xref=False` deja al lector buscar los objetos solo."""
    n_pages = len(pages)
    page_ids = [4 + 2 * i for i in range(n_pages)]
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R %s >>" % catalog_extra.encode("latin-1"),
        b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % p for p in page_ids), n_pages),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    for i, blocks in enumerate(pages):
        objects.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>"
            % (W, H, page_ids[i] + 1)
        )
        objects.append(raw_content if (i == 0 and raw_content is not None) else _stream(_content(blocks), compress))
    objects += extra_objects or []

    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    if not with_xref:
        return bytes(out + b"trailer\n<< /Size %d /Root 1 0 R %s >>\n%%%%EOF\n" % (len(objects) + 1, trailer_extra.encode()))
    start = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R %s >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, trailer_extra.encode(), start)
    return bytes(out)


def object_stream(body: bytes, objid: int) -> bytes:
    """Un flujo de objetos COMPRIMIDO con un solo objeto adentro: la forma de esconder un diccionario de una búsqueda."""
    head = b"%d 0 " % objid
    data = zlib.compress(head + body)
    return b"<< /Type /ObjStm /N 1 /First %d /Filter /FlateDecode /Length %d >>\nstream\n%s\nendstream" % (
        len(head),
        len(data),
        data,
    )


def bomb_stream(megabytes: int) -> bytes:
    """Un flujo de contenido que pesa poco y se descomprime a `megabytes` MB de ceros: una bomba de descompresión."""
    packer, chunk = zlib.compressobj(9), b"\0" * (1024 * 1024)
    data = b"".join(packer.compress(chunk) for _ in range(megabytes)) + packer.flush()
    return b"<< /Length %d /Filter /FlateDecode >>\nstream\n%s\nendstream" % (len(data), data)


VENTAS = [
    ["Fecha", "Producto", "Cantidad", "Importe"],
    ["2026-03-01", "Latte", "2", "104.00"],
    ["2026-03-01", "Croissant", "1", "42.00"],
    ["2026-03-02", "Café de olla", "3", "105.00"],
]


def _rc4(key: bytes, data: bytes) -> bytes:
    s, j = list(range(256)), 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    out, i, j = bytearray(), 0, 0
    for byte in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        out.append(byte ^ s[(s[i] + s[j]) % 256])
    return bytes(out)


def owner_only_encryption() -> str:
    """Un `/Encrypt` VÁLIDO (RC4 de 40 bits, revisión 2) con contraseña de USUARIO vacía: el PDF se abre sin pedir nada,
    pero sigue cifrado (solo el «propietario» puede editarlo). Es el caso que un lector acepta sin quejarse."""
    import hashlib

    pad = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")
    owner = _rc4(hashlib.md5(pad, usedforsecurity=False).digest()[:5], pad)  # contraseña de propietario: también vacía
    doc_id, perms = b"\x00" * 16, -4
    key = hashlib.md5(pad + owner + perms.to_bytes(4, "little", signed=True) + doc_id, usedforsecurity=False).digest()[:5]
    user = _rc4(key, pad)
    return f"/Encrypt << /Filter /Standard /V 1 /R 2 /O <{owner.hex()}> /U <{user.hex()}> /P {perms} >> /ID [<{doc_id.hex()}> <{doc_id.hex()}>]"
