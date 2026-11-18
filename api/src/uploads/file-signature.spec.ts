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
