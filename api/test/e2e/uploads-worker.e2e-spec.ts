// v0.8, parte del WORKER, contra el sistema vivo: la revisión PROFUNDA de archivos hostiles que pasan la API.
// (La API solo mira firmas; aquí se prueba lo que ella no puede ver: bombas, rangos gigantes, XML malicioso.)
// Ver docs/laboratorio/v0.8-subida.md. Cuenta de la semilla: usuario@example.com / TestOnly123!
import { Browser } from './helpers.js';
import { makeZip, sheet, workbook } from './zip.js';

const csv = (rows: number) => `fecha,total\n${Array.from({ length: rows }, (_, i) => `2026-01-01,${i}`).join('\n')}\n`;

const XXE = '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><worksheet><sheetData><row r="1"><c r="A1"><v>&x;</v></c></row></sheetData></worksheet>';
const LAUGHS =
  '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>' +
  '<worksheet><sheetData><row r="1"><c r="A1"><v>&c;</v></c></row></sheetData></worksheet>';

describe('v0.8 · revisión profunda del worker (sistema vivo)', () => {
  let user: Browser;

  /** Sube y espera a que el worker termine; devuelve el archivo ya resuelto. */
  async function review(bytes: Buffer | string, filename: string) {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(Buffer.from(bytes))], filename));
    const up = await user.postForm('/api/uploads', f);
    expect(up.status, `${filename}: ${JSON.stringify(up.body)}`).toBe(202);
    for (let i = 0; i < 60; i++) {
      const got = await user.get(`/api/uploads/${up.body.id}`);
      if (got.body.status !== 'queued' && got.body.status !== 'checking') {
        await user.delete(`/api/uploads/${up.body.id}`);
        return got.body as { status: string; rejectReason: string | null; checkedAt: string | null };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`${filename}: el worker no lo resolvió en 30 s`);
  }

  beforeAll(async () => {
    user = new Browser();
    await user.post('/api/auth/login', { email: 'usuario@example.com', password: 'TestOnly123!' });
    for (const u of (await user.get('/api/uploads')).body.items) await user.delete(`/api/uploads/${u.id}`);
  });

  it('archivos buenos: CSV y xlsx pasan a accepted, con fecha de revisión', async () => {
    for (const [bytes, name] of [[csv(100), 'ventas.csv'], [workbook(), 'libro.xlsx']] as const) {
      const r = await review(bytes, name);
      expect(r, name).toMatchObject({ status: 'accepted', rejectReason: null });
      expect(r.checkedAt).not.toBeNull();
    }
  });

  it.each([
    ['CSV solo con encabezado', csv(0), 'vacio.csv', 'empty'],
    ['CSV con 50 001 filas', csv(50_001), 'enorme.csv', 'range_too_large'],
    ['xlsx sin celdas', workbook({}, sheet(0)), 'sin-celdas.xlsx', 'empty'],
    ['rango gigante declarado (A1:XFD1048576) en un archivo diminuto', workbook({}, `<worksheet xmlns="x"><dimension ref="A1:XFD1048576"/><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`), 'rango.xlsx', 'range_too_large'],
    ['fila 1 048 576 sin declarar dimensión', workbook({}, '<worksheet><sheetData><row r="1048576"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'), 'fila.xlsx', 'range_too_large'],
    ['600 entradas dentro del zip', workbook(Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`xl/media/${i}.txt`, 'x']))), 'entradas.xlsx', 'too_many_entries'],
    ['XXE: entidad externa que lee /etc/passwd', workbook({}, XXE), 'xxe.xlsx', 'corrupt'],
    ['«billion laughs»: entidades anidadas', workbook({}, LAUGHS), 'laughs.xlsx', 'corrupt'],
    ['zip sin workbook.xml', makeZip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '' , 'xl/worksheets/sheet1.xml': '<<<' }), 'roto.xlsx', 'corrupt'],
  ])('rechaza: %s → %s', async (_n, bytes, name, reason) => {
    expect(await review(bytes, name)).toMatchObject({ status: 'rejected', rejectReason: reason });
  });

  it('BOMBA ZIP: menos de 1 MB que se vuelven 120 MB se rechaza sin descomprimirse entera (y el worker sigue vivo)', async () => {
    const bomb = workbook({ 'xl/padding.bin': Buffer.alloc(120 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(1_000_000);
    expect(await review(bomb, 'bomba.xlsx')).toMatchObject({ status: 'rejected', rejectReason: 'zip_bomb' });
    expect(await review(csv(10), 'despues.csv')).toMatchObject({ status: 'accepted' }); // sigue atendiendo
    expect((await new Browser().get('/api/health')).body.checks.worker).toBe('ok');
  });
});
