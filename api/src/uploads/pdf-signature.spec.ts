import { deflateSync } from 'node:zlib';
import { checkSignature } from './file-signature.js';

// Un PDF «mínimo» para la revisión barata: la firma, el comentario binario que ponen los generadores reales (bytes
// altos, para que nadie lo tome por texto) y un catálogo. `extra` va dentro del catálogo.
const pdf = (extra = '', version = '1.7') =>
  Buffer.concat([
    Buffer.from(`%PDF-${version}\n`, 'latin1'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    Buffer.from(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${extra}>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1'),
  ]);

describe('checkSignature: .pdf', () => {
  it('acepta un PDF 1.x o 2.0, con el comentario binario de los generadores reales', () => {
    expect(checkSignature('ventas.pdf', pdf())).toEqual({ ok: true, kind: 'pdf' });
    expect(checkSignature('Reporte.PDF', pdf('', '2.0'))).toEqual({ ok: true, kind: 'pdf' });
  });

  it.each([
    ['un CSV con extensión .pdf', Buffer.from('fecha,total\n2026-01-01,10\n')],
    ['un zip con extensión .pdf', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('a.xml')])],
    ['la firma sin versión', Buffer.from('%PDF-\n1 0 obj')],
    ['una versión que no existe', Buffer.from('%PDF-3.0\n1 0 obj')],
    ['un archivo vacío', Buffer.alloc(0)],
    // La norma tolera basura antes de la firma; aquí no: es la forma de hacer un políglota (vale como dos formatos).
    ['basura antes de la firma (políglota)', Buffer.concat([Buffer.from('<html><script>x</script>\n'), pdf()])],
  ])('rechaza %s', (_name, body) => {
    expect(checkSignature('x.pdf', body)).toMatchObject({ ok: false, message: expect.stringContaining('no es un PDF') });
  });

  it('un PDF cifrado (/Encrypt en el tráiler) se rechaza con un mensaje que lo dice', () => {
    const encrypted = Buffer.concat([pdf(), Buffer.from('trailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF\n')]);
    expect(checkSignature('x.pdf', encrypted)).toMatchObject({ ok: false, message: expect.stringContaining('cifrado') });
  });

  it.each([
    ['JavaScript al abrir', '/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'],
    ['/JS seguido de un salto de línea', '/AA << /O << /JS\n(x) >> >>'],
    ['/JS seguido de un flujo hexadecimal', '/JS<6170702e616c657274283129>'],
    ['abrir otro programa', '/OpenAction << /S /Launch /F (calc.exe) >>'],
    ['un archivo incrustado', '/Names << /EmbeddedFiles 5 0 R >>'],
    ['el tipo de un archivo incrustado', '/Type /EmbeddedFile'],
    ['multimedia activa', '/Annots [<< /Subtype /RichMedia >>]'],
    ['un formulario XFA', '/AcroForm << /XFA 7 0 R >>'],
  ])('contenido activo a la vista: %s', (_name, extra) => {
    expect(checkSignature('x.pdf', pdf(extra))).toMatchObject({ ok: false, message: expect.stringContaining('contenido activo') });
  });

  it('el nombre se busca entero: /JS no atrapa /JSON ni /JStyle, y /Encrypt no atrapa /EncryptMetadata', () => {
    expect(checkSignature('x.pdf', pdf('/JSON 1 /JStyle 2 /EncryptMetadata true'))).toEqual({ ok: true, kind: 'pdf' });
  });

  it('los nombres de PDF distinguen mayúsculas: /javascript no es /JavaScript', () => {
    expect(checkSignature('x.pdf', pdf('/javascript 1'))).toEqual({ ok: true, kind: 'pdf' });
  });

  it('LÍMITE a propósito: un nombre con escapes o un diccionario comprimido pasan la puerta; los ve el worker', () => {
    // `/J#61vaScript` es `/JavaScript` escrito con un escape hexadecimal (#61 = «a»).
    expect(checkSignature('x.pdf', pdf('/OpenAction << /S /J#61vaScript /JS#20 (x) >>'))).toEqual({ ok: true, kind: 'pdf' });
    // Un flujo de objetos comprimido: los bytes ya no dicen «/JavaScript».
    const hidden = deflateSync(Buffer.from('<< /S /JavaScript /JS (app.alert(1)) >>'));
    const objStm = Buffer.concat([Buffer.from('3 0 obj\n<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n'), hidden, Buffer.from('\nendstream\n')]);
    expect(checkSignature('x.pdf', Buffer.concat([pdf(), objStm]))).toEqual({ ok: true, kind: 'pdf' });
  });

  it('un PDF con otra extensión sigue rechazándose', () => {
    expect(checkSignature('x.csv', pdf()).ok).toBe(false);
    expect(checkSignature('x.xml', pdf()).ok).toBe(false);
    expect(checkSignature('x.xlsx', pdf()).ok).toBe(false);
  });
});
