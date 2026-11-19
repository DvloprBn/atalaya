import { checkSignature, displayNameOf, extensionOf } from './file-signature.js';

const PK = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// Un «xlsx» mínimo para esta revisión barata: firma de zip y los dos nombres internos que la API busca.
const xlsx = (extra = '') => Buffer.concat([PK, Buffer.from(`[Content_Types].xml xl/workbook.xml ${extra}`)]);
const text = (s: string) => Buffer.from(s, 'utf8');

describe('checkSignature', () => {
  it('acepta un CSV en UTF-8 (con o sin BOM) y un xlsx', () => {
    expect(checkSignature('ventas.csv', text('fecha,total\n2026-01-01,10\n'))).toEqual({ ok: true, kind: 'csv' });
    expect(checkSignature('ventas.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text('año,mes\n')]))).toEqual({ ok: true, kind: 'csv' });
    expect(checkSignature('Ventas.XLSX', xlsx())).toEqual({ ok: true, kind: 'xlsx' });
  });

  it.each(['macros.xlsm', 'libro.xlsb', 'viejo.xls', 'plantilla.xltm', 'sin-extension', 'ventas.csv.exe', '.csv.'])(
    'rechaza la extensión %s',
    (name) => expect(checkSignature(name, text('a,b\n1,2\n')).ok).toBe(false),
  );

  it('firma falsa: un .xlsx que no es zip, y un zip llamado .csv', () => {
    expect(checkSignature('x.xlsx', text('a,b\n1,2\n')).ok).toBe(false);
    expect(checkSignature('x.csv', xlsx()).ok).toBe(false);
  });

  it('un .xlsx con macros (vbaProject.bin) o que es otro zip (sin xl/workbook.xml) se rechaza', () => {
    expect(checkSignature('x.xlsx', xlsx('xl/vbaProject.bin'))).toMatchObject({ ok: false });
    expect(checkSignature('x.xlsx', Buffer.concat([PK, Buffer.from('word/document.xml')])).ok).toBe(false);
  });

  it('un .xls antiguo (OLE) con extensión .xlsx o .csv se rechaza', () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    expect(checkSignature('x.xlsx', ole).ok).toBe(false);
    expect(checkSignature('x.csv', ole).ok).toBe(false);
  });

  it.each([
    ['PDF', '%PDF-1.7\n1 0 obj'],
    ['ejecutable', 'MZ\x90 texto'],
    ['XML', '<?xml version="1.0"?><a/>'],
    ['HTML', '<!DOCTYPE html><p>'],
    ['bytes nulos', 'a,b\0\n1,2'],
  ])('un .csv que en realidad es %s se rechaza', (_name, body) => {
    expect(checkSignature('x.csv', text(body)).ok).toBe(false);
  });

  it('un CSV que no es UTF-8 (latin1) se rechaza con un mensaje que lo dice', () => {
    expect(checkSignature('x.csv', Buffer.from('año;mes\n', 'latin1'))).toMatchObject({ ok: false, message: expect.stringContaining('UTF-8') });
  });
});

const CFDI = '<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Total="116.00"/>';
const entry = (name: string) => Buffer.concat([PK, Buffer.from(`\u0000${name}`)]); // un zip «mínimo»: la firma y un nombre interno en claro

describe('checkSignature: .xml (un CFDI)', () => {
  it('acepta un XML en UTF-8 que parece un CFDI, con o sin BOM y con espacios antes de la declaración', () => {
    expect(checkSignature('factura.xml', text(CFDI))).toEqual({ ok: true, kind: 'xml' });
    expect(checkSignature('factura.XML', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text(CFDI)]))).toEqual({ ok: true, kind: 'xml' });
    expect(checkSignature('f.xml', text(`\n  ${CFDI}`))).toEqual({ ok: true, kind: 'xml' });
  });

  it.each([
    ['XXE: entidad externa que lee un archivo', '<?xml version="1.0"?><!DOCTYPE c [<!ENTITY x SYSTEM "file:///etc/passwd">]><cfdi:Comprobante>&x;</cfdi:Comprobante>'],
    ['«billion laughs»: entidades que se multiplican', '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><Comprobante>&b;</Comprobante>'],
    ['DOCTYPE en minúsculas', '<?xml version="1.0"?><!doctype x><Comprobante/>'],
    ['DOCTYPE con mayúsculas y minúsculas mezcladas', '<?xml version="1.0"?><!DocType x><Comprobante/>'],
    ['solo una declaración de entidad', '<Comprobante><!ENTITY x "y"></Comprobante>'],
  ])('rechaza en la puerta: %s', (_name, body) => {
    expect(checkSignature('f.xml', text(body))).toMatchObject({ ok: false, message: expect.stringContaining('DOCTYPE') });
  });

  it.each([
    ['un XML que no es un CFDI', '<?xml version="1.0"?><html><body>hola</body></html>', 'CFDI'],
    ['texto plano', 'hola, esto no es xml', 'no es un XML'],
    ['un CSV con extensión .xml', 'fecha,total\n2026-01-01,10\n', 'no es un XML'],
  ])('rechaza %s', (_name, body, fragment) => {
    expect(checkSignature('f.xml', text(body))).toMatchObject({ ok: false, message: expect.stringContaining(fragment) });
  });

  it('LÍMITE a propósito: la puerta es barata, así que un XML con la palabra «Comprobante» que no es un CFDI pasa; lo rechaza el worker (not_cfdi)', () => {
    expect(checkSignature('f.xml', text('<html><body>Comprobante de pago</body></html>'))).toEqual({ ok: true, kind: 'xml' });
    // Un DOCTYPE escondido en un comentario no es una declaración: lo que cuenta es `<!DOCTYPE`, que el worker vuelve a prohibir.
    expect(checkSignature('f.xml', text('<Comprobante><!-- DOCTYPE --></Comprobante>'))).toEqual({ ok: true, kind: 'xml' });
  });

  it('rechaza lo que no es texto UTF-8: bytes nulos, UTF-16, latin1, un zip o un PDF llamados .xml', () => {
    expect(checkSignature('f.xml', Buffer.concat([text(CFDI), Buffer.from([0])])).ok).toBe(false);
    expect(checkSignature('f.xml', Buffer.from(`\ufeff${CFDI}`, 'utf16le')).ok).toBe(false); // UTF-16: sus bytes nulos lo delatan
    expect(checkSignature('f.xml', Buffer.from(CFDI.replace('Comprobante', 'Comprobanté'), 'latin1')).ok).toBe(false);
    expect(checkSignature('f.xml', entry('a.xml'))).toMatchObject({ ok: false, message: expect.stringContaining('comprimido') });
    expect(checkSignature('f.xml', text('%PDF-1.7 Comprobante')).ok).toBe(false);
  });
});

describe('checkSignature: .zip (varios CFDI)', () => {
  it('acepta un zip con entradas .xml', () => {
    expect(checkSignature('cfdi-2026-01.zip', entry('0a1b.xml'))).toEqual({ ok: true, kind: 'zip' });
  });

  it('rechaza lo que no es un zip, un libro de Excel con otra extensión y un zip sin XML', () => {
    expect(checkSignature('x.zip', text(CFDI))).toMatchObject({ ok: false, message: expect.stringContaining('no es un archivo ZIP') });
    expect(checkSignature('x.zip', xlsx())).toMatchObject({ ok: false, message: expect.stringContaining('libro de Excel') });
    expect(checkSignature('x.zip', entry('foto.png'))).toMatchObject({ ok: false, message: expect.stringContaining('ningún archivo .xml') });
  });

  it('un .xlsx o un .csv que son zip, o un zip llamado .xlsx, siguen rechazándose como antes', () => {
    expect(checkSignature('x.xlsx', entry('a.xml')).ok).toBe(false); // un zip cualquiera no es un libro
    expect(checkSignature('x.csv', entry('a.xml')).ok).toBe(false);
  });
});

describe('extensionOf y displayNameOf', () => {
  it('la extensión es la del último tramo, en minúsculas', () => {
    expect(extensionOf('C:\\docs\\Ventas.CSV')).toBe('csv');
    expect(extensionOf('a.csv/sin-ext')).toBe('');
  });

  it('el nombre para mostrar no trae ruta ni caracteres de control, y se recorta', () => {
    expect(displayNameOf('../../etc/passwd.csv')).toBe('passwd.csv');
    expect(displayNameOf('C:\\x\\ventas.csv')).toBe('ventas.csv');
    expect(displayNameOf('a\u0000b\u202e.csv')).toBe('ab.csv'); // nulo y «derecha a izquierda» fuera
    expect(displayNameOf('  a   b.csv ')).toBe('a b.csv');
    expect(displayNameOf('x'.repeat(300) + '.csv')).toHaveLength(100);
    expect(displayNameOf('///')).toBeNull();
  });

  it('un nombre UTF-8 leído como latin1 por multer se repara', () => {
    const mojibake = Buffer.from('ventas-año.csv', 'utf8').toString('latin1');
    expect(displayNameOf(mojibake)).toBe('ventas-año.csv');
  });
});
