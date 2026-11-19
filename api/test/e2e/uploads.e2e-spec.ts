// Pruebas de seguridad de v0.8 (parte de la API) contra el sistema VIVO: subida segura.
// Cubre firma falsa, .xlsm, tamaño, campos de más, nombre malicioso, IDOR (API1), jerarquía del admin
// y la carrera del tope de 10 archivos por cuenta. Las pruebas de la revisión PROFUNDA (bomba zip,
// rango gigante) llegan con el worker. Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser } from './helpers.js';

const PK = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const xlsxBytes = (extra = '') => Buffer.concat([PK, Buffer.from(`[Content_Types].xml xl/workbook.xml ${extra}`)]);
const csv = 'fecha,total\n2026-01-01,10\n';

function form(bytes: Buffer | string, filename: string, extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.append('file', new File([new Uint8Array(Buffer.from(bytes))], filename)); // Buffer → Uint8Array: lo que BlobPart acepta
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
}

async function loginAs(role: string): Promise<Browser> {
  const browser = new Browser();
  const res = await browser.post('/api/auth/login', { email: `${role}@example.com`, password: 'TestOnly123!' });
  if (res.status !== 200) throw new Error(`No se pudo entrar como ${role}: ${res.status}`);
  return browser;
}

/** Borra todos los archivos de una cuenta para empezar limpio. */
async function clean(b: Browser) {
  for (;;) {
    const page = await b.get('/api/uploads');
    if (page.body.items.length === 0) return;
    for (const u of page.body.items) await b.delete(`/api/uploads/${u.id}`);
  }
}

describe('v0.8 · subida segura (sistema vivo)', () => {
  let user: Browser;
  let other: Browser;
  let admin: Browser;
  let sup: Browser;

  beforeAll(async () => {
    [user, other, admin, sup] = await Promise.all(['usuario', 'staff', 'admin', 'super'].map(loginAs));
    await Promise.all([user, other, admin, sup].map(clean));
  });
  afterAll(async () => {
    await Promise.all([user, other, admin, sup].map(clean));
  });

  it('sin sesión: 401 en toda ruta de subidas', async () => {
    const anon = new Browser();
    expect((await anon.postForm('/api/uploads', form(csv, 'a.csv'))).status).toBe(401);
    expect((await anon.get('/api/uploads')).status).toBe(401);
    expect((await anon.get('/api/admin/uploads')).status).toBe(401);
  });

  it('un CSV válido se acepta (202, en cola) y la respuesta no revela dónde ni con qué hash se guardó', async () => {
    const res = await user.postForm('/api/uploads', form(csv, 'ventas.csv'));
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ kind: 'csv', status: 'queued', rejectReason: null, checkedAt: null, displayName: 'ventas.csv', sizeBytes: csv.length });
    expect(Object.keys(res.body).sort()).toEqual(['checkedAt', 'createdAt', 'displayName', 'id', 'kind', 'rejectReason', 'sizeBytes', 'status']);
    expect((await user.get(`/api/uploads/${res.body.id}`)).status).toBe(200);
  });

  it('un xlsx (revisión barata) se acepta', async () => {
    expect((await user.postForm('/api/uploads', form(xlsxBytes(), 'libro.xlsx'))).body.kind).toBe('xlsx');
  });

  it.each([
    ['.xlsm', xlsxBytes(), 'macros.xlsm'],
    ['.xlsx con vbaProject.bin dentro', xlsxBytes('xl/vbaProject.bin'), 'trampa.xlsx'],
    ['firma falsa: texto llamado .xlsx', csv, 'falso.xlsx'],
    ['firma falsa: zip llamado .csv', xlsxBytes(), 'falso.csv'],
    ['otro zip llamado .xlsx', Buffer.concat([PK, Buffer.from('word/document.xml')]), 'docx.xlsx'],
    ['.xls antiguo (OLE)', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]), 'viejo.xlsx'],
    ['PDF llamado .csv', '%PDF-1.7\n1 0 obj', 'doc.csv'],
    ['CSV con bytes nulos', 'a,b\0\n1,2\n', 'nulos.csv'],
    ['CSV en latin1', Buffer.from('año;mes\n', 'latin1'), 'latin1.csv'],
    ['sin extensión', csv, 'ventas'],
  ])('415: %s', async (_name, bytes, filename) => {
    expect((await user.postForm('/api/uploads', form(bytes, filename))).status).toBe(415);
  });

  it('413 pasando 5 MB; 400 vacío, sin archivo, con campo extra o con dos archivos; JSON en vez de multipart: 400', async () => {
    const big = Buffer.from('a,b\n'.repeat(5 * 1024 * 256 + 1));
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    expect((await user.postForm('/api/uploads', form(big, 'grande.csv'))).status).toBe(413);
    expect((await user.postForm('/api/uploads', form('', 'vacio.csv'))).status).toBe(400);
    expect((await user.postForm('/api/uploads', new FormData())).status).toBe(400);
    expect((await user.postForm('/api/uploads', form(csv, 'a.csv', { ownerId: 'otro' }))).status).toBe(400);
    const two = form(csv, 'a.csv');
    two.append('file', new File([csv], 'b.csv'));
    expect((await user.postForm('/api/uploads', two)).status).toBe(400);
    expect((await user.post('/api/uploads', { file: 'x' })).status).toBe(400);
  });

  it('un nombre malicioso se acepta pero NO es ruta: se guarda con otro nombre y se muestra saneado', async () => {
    const res = await user.postForm('/api/uploads', form(csv, '../../etc/pass‮wd.csv'));
    expect(res.status).toBe(202);
    expect(res.body.displayName).toBe('passwd.csv');
  });

  it('IDOR (API1): el archivo de otra cuenta, y el de nadie, responden igual (404), también a un admin', async () => {
    const mine = (await user.postForm('/api/uploads', form(csv, 'mio.csv'))).body.id;
    const ghost = '00000000-0000-4000-8000-000000000000';
    const nobody = await other.get(`/api/uploads/${ghost}`);
    for (const who of [other, admin, sup]) {
      const got = await who.get(`/api/uploads/${mine}`);
      expect(got.status).toBe(404);
      expect(got.body).toEqual({ ...nobody.body });
      expect((await who.delete(`/api/uploads/${mine}`)).status).toBe(404);
    }
    expect((await user.get(`/api/uploads/${mine}`)).status).toBe(200); // sigue ahí
    expect((await other.get('/api/uploads')).body.total).toBe(0); // y no aparece en la lista de otro
    expect((await user.get('/api/uploads/no-es-uuid')).status).toBe(400);
  });

  it('el listado del admin: 403 a niveles bajos; solo metadatos y solo de cuentas por debajo', async () => {
    expect((await user.get('/api/admin/uploads')).status).toBe(403);
    const asAdmin = await admin.get('/api/admin/uploads');
    expect(asAdmin.status).toBe(200);
    const row = asAdmin.body.items.find((i: { ownerEmail: string }) => i.ownerEmail === 'usuario@example.com');
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'kind', 'ownerEmail', 'sizeBytes', 'status']); // sin nombre ni contenido
    // El archivo de un admin no lo ve otro admin (mismo nivel), pero sí el super (nivel mayor).
    await admin.postForm('/api/uploads', form(csv, 'del-admin.csv'));
    const emails = (r: { body: { items: { ownerEmail: string }[] } }) => r.body.items.map((i) => i.ownerEmail);
    expect(emails(await admin.get('/api/admin/uploads'))).not.toContain('admin@example.com');
    expect(emails(await sup.get('/api/admin/uploads'))).toContain('admin@example.com');
  });

  it('borrar: 200 y luego 404 (el archivo sale de la lista)', async () => {
    const id = (await other.postForm('/api/uploads', form(csv, 'temporal.csv'))).body.id;
    expect((await other.delete(`/api/uploads/${id}`)).body).toEqual({ message: 'Archivo borrado' });
    expect((await other.get(`/api/uploads/${id}`)).status).toBe(404);
  });

  it('carrera: 12 subidas a la vez sobre una cuenta vacía → exactamente 10 pasan y 2 reciben 409', async () => {
    await clean(user);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => user.postForm('/api/uploads', form(csv, `c${i}.csv`))));
    const count = (s: number) => results.filter((r) => r.status === s).length;
    expect({ aceptadas: count(202), topadas: count(409) }).toEqual({ aceptadas: 10, topadas: 2 });
    expect((await user.get('/api/uploads')).body.total).toBe(10);
    // Borrar uno libera un lugar.
    const first = (await user.get('/api/uploads')).body.items[0].id;
    await user.delete(`/api/uploads/${first}`);
    expect((await user.postForm('/api/uploads', form(csv, 'otra.csv'))).status).toBe(202);
  });
});
