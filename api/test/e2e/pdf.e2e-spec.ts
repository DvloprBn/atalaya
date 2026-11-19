// v0.12 contra el sistema VIVO: PDF. Primero la PUERTA de la API (firma, cifrado y contenido activo a la vista); después el
// WORKER real: lo escondido con escapes o comprimido, la bomba de descompresión y el análisis completo de un reporte.
// Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser } from './helpers.js';
import { bombStream, makePdf, objectStream, VENTAS } from './pdf.js';

// Un PDF «mínimo» para la puerta: firma, comentario binario de los generadores reales y un catálogo con `extra` adentro.
const pdf = (extra = '') =>
  Buffer.concat([
    Buffer.from('%PDF-1.7\n', 'latin1'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    Buffer.from(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${extra}>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1'),
  ]);

describe('v0.12 · PDF en la puerta (sistema vivo)', () => {
  let user: Browser;

  const post = (bytes: Buffer | string, name: string) => {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(Buffer.from(bytes))], name));
    return user.postForm('/api/uploads', f);
  };
  const wipe = async () => {
    for (const u of (await user.get('/api/uploads')).body.items) await user.delete(`/api/uploads/${u.id}`);
  };

  beforeAll(async () => {
    user = new Browser();
    const res = await user.post('/api/auth/login', { email: 'usuario@example.com', password: 'TestOnly123!' });
    if (res.status !== 200) throw new Error(`login: ${res.status}`);
    await wipe();
  });
  afterAll(async () => wipe());

  it('un PDF con su firma se acepta en la puerta con su tipo (la revisión profunda es del worker)', async () => {
    const res = await post(pdf(), 'reporte-ventas.pdf');
    expect([res.status, res.body.kind]).toEqual([202, 'pdf']);
  });

  it.each([
    ['un CSV con extensión .pdf', 'fecha,total\n2026-01-01,10\n', 'f.pdf'],
    ['basura antes de la firma (un políglota)', Buffer.concat([Buffer.from('<html><script>x</script>\n'), pdf()]), 'f.pdf'],
    ['un PDF cifrado', Buffer.concat([pdf(), Buffer.from('trailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n')]), 'f.pdf'],
    ['JavaScript al abrir', pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'), 'f.pdf'],
    ['una acción que abre otro programa', pdf('/OpenAction << /S /Launch /F (calc.exe) >>'), 'f.pdf'],
    ['un archivo incrustado', pdf('/Names << /EmbeddedFiles 5 0 R >>'), 'f.pdf'],
    ['un formulario XFA', pdf('/AcroForm << /XFA 7 0 R >>'), 'f.pdf'],
    ['un PDF con extensión .csv', pdf(), 'f.csv'],
    ['un PDF con extensión .xml', pdf(), 'f.xml'],
  ])('415: %s', async (_name, bytes, filename) => {
    const res = await post(bytes, filename);
    expect(res.status).toBe(415);
  });

  it('el 415 explica el motivo, sin repetir nada del archivo', async () => {
    const res = await post(pdf('/OpenAction << /S /JavaScript /JS (secreto-del-archivo) >>'), 'f.pdf');
    expect(res.status).toBe(415);
    expect(JSON.stringify(res.body)).toContain('contenido activo');
    expect(JSON.stringify(res.body)).not.toContain('secreto-del-archivo');
  });
});

describe('v0.12 · PDF en el worker (sistema vivo, worker real)', () => {
  let user: Browser;
  const HEADER = VENTAS[0];
  const MORE = [['2026-03-03', 'Té chai', '1', '48.00'], ['2026-03-04', 'Latte', '1', '52.00']];

  async function send(bytes: Buffer, name: string) {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(bytes)], name));
    const up = await user.postForm('/api/uploads', f);
    if (up.status !== 202) return { status: 'rejected', rejectReason: `http ${up.status}`, id: '' };
    for (let i = 0; i < 60; i++) {
      const got = (await user.get(`/api/uploads/${up.body.id}`)).body;
      if (got.status !== 'queued' && got.status !== 'checking') return { ...got, id: up.body.id };
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`${name}: sin resolver`);
  }
  async function until(id: string, ...states: string[]) {
    for (let i = 0; i < 60; i++) {
      const a = (await user.get(`/api/analyses/${id}`)).body;
      if (states.includes(a.status)) return a;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`el análisis ${id} no llegó a ${states.join('/')}`);
  }
  const wipe = async () => {
    for (const u of (await user.get('/api/uploads')).body.items) await user.delete(`/api/uploads/${u.id}`);
  };

  beforeAll(async () => {
    user = new Browser();
    const res = await user.post('/api/auth/login', { email: 'usuario@example.com', password: 'TestOnly123!' });
    if (res.status !== 200) throw new Error(`login: ${res.status}`);
    await wipe();
  });
  afterEach(async () => wipe());

  it('un reporte de dos páginas: la tabla continúa, el encabezado repetido no es un dato y la tabla de totales se cuenta aparte', async () => {
    const pdf = makePdf([
      [['text', 'Reporte de ventas, marzo'], ['table', VENTAS]],
      [['table', [HEADER, ...MORE]], ['table', [['Total', '351.00'], ['IVA', '56.16']]]],
    ]);
    const up = await send(pdf, 'reporte-marzo.pdf');
    expect(up).toMatchObject({ status: 'accepted', kind: 'pdf' });
    const id = (await user.post('/api/analyses', { uploadId: up.id })).body.id;
    const ready = await until(id, 'awaiting_mapping', 'failed');
    expect(ready.status).toBe('awaiting_mapping');
    expect(ready.preview.rowCount).toBe(5);
    await user.put(`/api/analyses/${id}/mapping`, { date: 0, product: 1, quantity: 2, amount: 3 });
    const done = await until(id, 'done', 'failed');
    // A mano: 104 + 42 + 105 + 48 + 52 = 351.00; las 2 filas de la tabla de totales se leen y se tiran, contadas.
    expect(done.report).toMatchObject({ rowsRead: 7, rowsKept: 5, rowsDropped: 2, totalAmount: '351.00', dateFrom: '2026-03-01', dateTo: '2026-03-04' });
    const skipped = done.report.issues.find((i: { code: string }) => i.code === 'table_skipped');
    expect(skipped).toMatchObject({ count: 2, dropped: true, examples: [{ row: 2, value: 'Total' }, { row: 2, value: 'IVA' }] });
  });

  it.each([
    ['JavaScript escrito con escapes (#61 = a)', () => makePdf([[['table', VENTAS]]], { catalogExtra: '/OpenAction << /S /J#61vaScript /J#53 (x) >>' }), 'active_content'],
    [
      'JavaScript dentro de un flujo de objetos COMPRIMIDO',
      () => makePdf([[['table', VENTAS]]], { extraObjects: [objectStream('<< /S /JavaScript /JS (app.alert(1)) >>', 99)], withXref: false }),
      'active_content',
    ],
    ['un escaneo (sin capa de texto)', () => makePdf([[['lines']]]), 'no_text_layer'],
    ['texto sin ninguna tabla', () => makePdf([[['text', 'Gracias por su compra.'], ['text', 'Vuelva pronto.']]]), 'no_table'],
    ['51 páginas', () => makePdf(Array.from({ length: 51 }, () => [['text', 'x']] as ['text', string][])), 'range_too_large'],
  ])('pasa la puerta y lo rechaza el worker: %s', async (_name, build, reason) => {
    const up = await send(build(), 'hostil.pdf');
    expect(up).toMatchObject({ status: 'rejected', rejectReason: reason });
  });

  it('una bomba de descompresión (1 MB que crece a 1 GB) choca con el tope de memoria del hijo, y el worker sigue vivo', async () => {
    const pdf = makePdf([[['table', VENTAS]]], { rawContent: await bombStream(1024) });
    expect(pdf.length).toBeLessThan(5 * 1024 * 1024);
    const started = Date.now();
    expect(await send(pdf, 'bomba.pdf')).toMatchObject({ status: 'rejected', rejectReason: 'range_too_large' });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect((await user.get('/api/health')).body.checks.worker).toBe('ok');
    expect((await send(makePdf([[['table', VENTAS]]]), 'despues.pdf')).status).toBe('accepted'); // prueba de vida
  });
});
