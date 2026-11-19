// v0.9 contra el sistema VIVO y con el worker REAL: vista previa, mapeo, limpieza, informe y exportación.
// El ataque de la fase: INYECCIÓN DE FÓRMULAS al exportar. Ver docs/laboratorio/v0.9-analisis.md.
// Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser } from './helpers.js';
import { realWorkbook, workbook } from './zip.js';

const csv = (...rows: string[]) => rows.join('\n') + '\n';

async function loginAs(role: string): Promise<Browser> {
  const b = new Browser();
  const res = await b.post('/api/auth/login', { email: `${role}@example.com`, password: 'TestOnly123!' });
  if (res.status !== 200) throw new Error(`No se pudo entrar como ${role}: ${res.status}`);
  return b;
}

describe('v0.9 · análisis (sistema vivo, worker real)', () => {
  let user: Browser;
  let other: Browser;

  async function upload(bytes: Buffer | string, name: string): Promise<string> {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(Buffer.from(bytes))], name));
    const up = await user.postForm('/api/uploads', f);
    expect(up.status, JSON.stringify(up.body)).toBe(202);
    for (let i = 0; i < 40; i++) {
      const got = (await user.get(`/api/uploads/${up.body.id}`)).body;
      if (got.status === 'accepted') return up.body.id;
      if (got.status === 'rejected') throw new Error(`${name} rechazado: ${got.rejectReason}`);
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`${name}: sin resolver`);
  }

  /** Espera a que el análisis llegue a uno de esos estados. */
  async function until(id: string, ...states: string[]) {
    for (let i = 0; i < 60; i++) {
      const a = (await user.get(`/api/analyses/${id}`)).body;
      if (states.includes(a.status)) return a;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`el análisis ${id} no llegó a ${states.join('/')}`);
  }

  async function download(id: string, kind: 'clean' | 'report', who = user) {
    const res = await fetch(`http://127.0.0.1:3070/api/analyses/${id}/export/${kind}`, {
      headers: { cookie: [...who.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    return { res, text: (await res.text()).replace(/^﻿/, '') };
  }

  /** Cada celda de un CSV (lo bastante simple para estas pruebas: sin comas dentro de las celdas). */
  const cells = (text: string) => text.trim().split(/\r?\n/).map((line) => line.split(','));

  /** Borra todos los archivos de la cuenta (y, en cascada, sus análisis). */
  async function wipe(b: Browser) {
    for (const u of (await b.get('/api/uploads')).body.items) await b.delete(`/api/uploads/${u.id}`);
  }

  beforeAll(async () => {
    [user, other] = await Promise.all([loginAs('usuario'), loginAs('staff')]);
    await Promise.all([wipe(user), wipe(other)]);
  });
  // Después de CADA prueba, aunque haya fallado: una prueba que abortara dejaría análisis que falsean el conteo de las demás.
  afterEach(async () => {
    await Promise.all([wipe(user), wipe(other)]);
  });

  it('recorrido completo con un CSV sucio: vista previa → mapeo → informe → descargas', async () => {
    const file = csv(
      'Fecha,Total,Cantidad,Producto,Sucursal,Folio',
      '2026-01-05,100.50,2,pan,norte,A1',
      '2026-01-05,100.50,2,pan,norte,A1', //          duplicado exacto
      '2026-01-06,-20.00,1,pan,norte,A2', //          devolución: se queda, con aviso
      'ayer,50.00,1,leche,sur,A3', //                 fecha inválida
      '2026-01-07,mucho,1,leche,sur,A4', //           importe inválido
      '2030-01-01,10.00,1,leche,sur,A5', //           del futuro
      ',,,,,', //                                     fila vacía
      '2026-01-08,30.25,3,  café   molido ,sur,A6', // espacios de más
    );
    const up = await upload(file, 'ventas.csv');
    const created = await user.post('/api/analyses', { uploadId: up });
    expect(created.status).toBe(202);
    expect(created.body).toMatchObject({ status: 'previewing', preview: null, mapping: null, report: null, failReason: null });
    expect(Object.keys(created.body)).not.toContain('resultKey');

    const ready = await until(created.body.id, 'awaiting_mapping', 'failed');
    expect(ready.status).toBe('awaiting_mapping');
    expect(ready.preview.rowCount).toBe(7);
    expect(ready.preview.columns.map((c: { name: string }) => c.name)).toEqual(['Fecha', 'Total', 'Cantidad', 'Producto', 'Sucursal', 'Folio']);
    expect(ready.preview.suggested).toEqual({ date: 0, amount: 1, quantity: 2, product: 3, branch: 4, orderId: 5 });

    // La persona confirma la sugerencia.
    const put = await user.put(`/api/analyses/${created.body.id}/mapping`, ready.preview.suggested);
    expect(put.status).toBe(202);
    const done = await until(created.body.id, 'done', 'failed');
    expect(done.status).toBe('done');
    expect(done.mapping).toMatchObject({ date: 0, amount: 1, dateOrder: 'auto', decimalSeparator: 'auto' });

    const r = done.report;
    expect(r).toMatchObject({ rowsRead: 8, rowsKept: 3, rowsDropped: 5, dateFrom: '2026-01-05', dateTo: '2026-01-08', totalAmount: '110.75' });
    expect(r.rowsKept + r.rowsDropped).toBe(r.rowsRead); // las cuentas cuadran
    const by = Object.fromEntries(r.issues.map((i: { code: string; count: number; dropped: boolean }) => [i.code, i]));
    expect(by.duplicate_row.count).toBe(1);
    expect(by.bad_date).toMatchObject({ count: 1, dropped: true });
    expect(by.bad_amount.count).toBe(1);
    expect(by.future_date.count).toBe(1);
    expect(by.blank_row.count).toBe(1);
    expect(by.negative_amount).toMatchObject({ count: 1, dropped: false }); // avisa, no tira
    expect(by.text_trimmed.count).toBe(1);
    expect(by.bad_date.examples[0]).toEqual({ row: 5, value: 'ayer' }); // la fila del ARCHIVO (el encabezado es la 1)

    const clean1 = await download(created.body.id, 'clean');
    expect(clean1.res.status).toBe(200);
    expect(clean1.res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(clean1.res.headers.get('content-disposition')).toMatch(/^attachment; filename="atalaya-[0-9a-f]{8}-clean\.csv"$/);
    expect(clean1.res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(cells(clean1.text)).toEqual([
      ['fecha', 'importe', 'cantidad', 'producto', 'sucursal', 'pedido'],
      ['2026-01-05', '100.50', '2', 'pan', 'norte', 'A1'],
      ['2026-01-06', '-20.00', '1', 'pan', 'norte', 'A2'], // el importe negativo legítimo, intacto
      ['2026-01-08', '30.25', '3', 'café molido', 'sur', 'A6'],
    ]);
    const rep = await download(created.body.id, 'report');
    expect(rep.text).toContain('resumen,totalAmount,110.75');
  });

  it('INYECCIÓN DE FÓRMULAS: ninguna celda de texto sale como fórmula, ni en los datos ni en los ejemplos del informe', async () => {
    const evil = [
      '=HYPERLINK("http://evil.example/steal","click")',
      "=cmd|' /C calc'!A0",
      '+SUM(1+1)',
      '@SUM(A1)',
      '-2+3',
      '\t=1+1',
    ];
    const rows = evil.map((payload, i) => `2026-02-0${i + 1},10.00,1,"${payload.replace(/"/g, '""')}",sur,F${i}`);
    // El mismo ataque en una celda que el informe cita como ejemplo (una fecha inválida).
    rows.push('"=cmd|\' /C calc\'!A0",10.00,1,pan,sur,F9');
    const up = await upload(csv('fecha,total,cant,producto,sucursal,folio', ...rows), 'ataque.csv');
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const preview = await until(id, 'awaiting_mapping');
    await user.put(`/api/analyses/${id}/mapping`, preview.preview.suggested);
    const done = await until(id, 'done');
    expect(done.report.issues.find((i: { code: string }) => i.code === 'bad_date').examples[0].value).toContain('=cmd');

    for (const kind of ['clean', 'report'] as const) {
      const { text } = await download(id, kind);
      // Se parsea de verdad (con comillas): cada celda de TEXTO que empiece como fórmula debe llevar la comilla delante.
      const records = parseCsv(text);
      const dangerous = records.flat().filter((c) => /^[\s ]*[=+@-]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
      expect(dangerous, `${kind}: celdas peligrosas sin neutralizar`).toEqual([]);
    }
    const dataRows = parseCsv((await download(id, 'clean')).text);
    expect(dataRows.flat()).toContain("'=cmd|' /C calc'!A0"); // neutralizada, no borrada: el dato se conserva
    expect(dataRows.flat()).toContain("'-2+3");
  });

  it('un .xlsx REAL (leído con openpyxl): mismas reglas, y los números de Excel llegan como números', async () => {
    const up = await upload(
      realWorkbook([
        ['Fecha', 'Importe', 'Producto'],
        ['2026-03-01', 10.5, 'pan'],
        ['2026-03-02', 20, '=HYPERLINK("x")'],
        [null, null, null],
        ['2026-03-03', 5.25, 'leche'],
      ]),
      'libro.xlsx',
    );
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const preview = await until(id, 'awaiting_mapping', 'failed');
    expect(preview.status).toBe('awaiting_mapping');
    expect(preview.preview.suggested).toMatchObject({ date: 0, amount: 1, product: 2 });
    await user.put(`/api/analyses/${id}/mapping`, preview.preview.suggested);
    const done = await until(id, 'done', 'failed');
    expect(done.report).toMatchObject({ rowsKept: 3, totalAmount: '35.75' });
    expect(parseCsv((await download(id, 'clean')).text).flat()).toContain('\'=HYPERLINK("x")'); // la fórmula, neutralizada
  });

  it('un .xlsx que PASÓ la revisión de v0.8 pero openpyxl no puede leer: falla limpio y el worker sigue vivo', async () => {
    const up = await upload(workbook(), 'minimo.xlsx'); // zip válido, pero sin las relaciones de un libro real
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const failed = await until(id, 'failed', 'awaiting_mapping');
    expect(failed).toMatchObject({ status: 'failed', failReason: 'unreadable', report: null });
    expect(JSON.stringify(failed)).not.toMatch(/Traceback|openpyxl|\.py/); // nunca texto de error interno
    // «El worker sigue vivo» se demuestra haciéndolo TRABAJAR otra vez, no preguntando a /api/health: esa ruta tiene
    // tope por IP y `smoke.sh` lo agota a propósito (en el CI corre justo antes de estas pruebas y daba 429).
    const next = await upload(csv('fecha,total', '2026-01-01,10'), 'despues.csv');
    const again = (await user.post('/api/analyses', { uploadId: next })).body.id;
    expect((await until(again, 'awaiting_mapping', 'failed')).status).toBe('awaiting_mapping');
  });

  it('fallos de contenido con motivo cerrado: sin columnas útiles, y «no quedó nada»', async () => {
    const one = await upload(csv('solo', '1', '2'), 'una-columna.csv');
    const a = (await user.post('/api/analyses', { uploadId: one })).body.id;
    expect(await until(a, 'failed')).toMatchObject({ failReason: 'too_few_columns' });

    const none = await upload(csv('fecha,total', 'ayer,10', 'hoy,20'), 'nada-valido.csv');
    const b = (await user.post('/api/analyses', { uploadId: none })).body.id;
    const ready = await until(b, 'awaiting_mapping');
    await user.put(`/api/analyses/${b}/mapping`, { date: 0, amount: 1 });
    expect(await until(b, 'failed', 'done')).toMatchObject({ status: 'failed', failReason: 'nothing_left' });
    expect(ready.preview.rowCount).toBe(2);
  });

  it('el mapeo manda: otro orden de fecha y otro separador decimal dan otro resultado', async () => {
    const up = await upload(csv('fecha;total', '03/04/2026;"1.234,50"', '05/06/2026;"2.000,00"'), 'europeo.csv');
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    await until(id, 'awaiting_mapping');
    await user.put(`/api/analyses/${id}/mapping`, { date: 0, amount: 1, dateOrder: 'mdy', decimalSeparator: ',' });
    const done = await until(id, 'done');
    expect(done.report).toMatchObject({ dateFrom: '2026-03-04', dateTo: '2026-05-06', totalAmount: '3234.50' });
    expect(done.report.issues.find((i: { code: string }) => i.code === 'ambiguous_dates')).toBeUndefined(); // lo dijo la persona
  });

  it('con fechas ambiguas y sin indicar el orden, el informe lo AVISA (no adivina en silencio)', async () => {
    const up = await upload(csv('fecha,total', '03/04/2026,10', '05/06/2026,20'), 'ambiguo.csv');
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const p = await until(id, 'awaiting_mapping');
    await user.put(`/api/analyses/${id}/mapping`, p.preview.suggested);
    const done = await until(id, 'done');
    expect(done.report.dateFrom).toBe('2026-04-03'); // día/mes/año, el orden de México
    expect(done.report.issues.find((i: { code: string }) => i.code === 'ambiguous_dates')).toMatchObject({ count: 2, dropped: false });
  });

  it('control de acceso: lo ajeno es 404 (incluso el mapeo, la descarga y el borrado) y un admin tampoco lo ve', async () => {
    const up = await upload(csv('fecha,total', '2026-01-01,10'), 'mio.csv');
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const p = await until(id, 'awaiting_mapping');
    await user.put(`/api/analyses/${id}/mapping`, p.preview.suggested);
    await until(id, 'done');
    const admin = await loginAs('admin');
    for (const who of [other, admin]) {
      expect((await who.post('/api/analyses', { uploadId: up })).status).toBe(404); // crear sobre un archivo ajeno
      expect((await who.get(`/api/analyses/${id}`)).status).toBe(404);
      expect((await who.put(`/api/analyses/${id}/mapping`, { date: 0, amount: 1 })).status).toBe(404);
      expect((await who.delete(`/api/analyses/${id}`)).status).toBe(404);
      expect((await download(id, 'clean', who)).res.status).toBe(404);
      expect((await download(id, 'report', who)).res.status).toBe(404);
    }
    expect((await other.get('/api/analyses')).body.total).toBe(0);
    expect((await user.get(`/api/analyses/${id}`)).status).toBe(200); // el dueño sigue viéndolo
    expect((await new Browser().get(`/api/analyses/${id}`)).status).toBe(401);
    // Borrar el análisis retira sus descargas; el archivo subido no se toca.
    expect((await user.delete(`/api/analyses/${id}`)).body).toEqual({ message: 'Análisis borrado' });
    expect((await user.get(`/api/analyses/${id}`)).status).toBe(404);
    expect((await download(id, 'clean')).res.status).toBe(404);
    expect((await user.get(`/api/uploads/${up}`)).status).toBe(200);
  });

  it('estados y entradas inválidas: 409 fuera de turno, 400 en el mapeo, 404 en lo desconocido', async () => {
    const up = await upload(csv('fecha,total,otra', '2026-01-01,10,x'), 'estados.csv');
    const id = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const url = `/api/analyses/${id}`;
    await until(id, 'awaiting_mapping');
    expect((await download(id, 'clean')).res.status).toBe(409); // aún no termina
    for (const bad of [{ date: 0, amount: 9 }, { date: 1, amount: 1 }, { date: '0', amount: 1 }, { date: 0 }, { date: 0, amount: 1, formula: '=1' }, { date: 0, amount: 1, dateOrder: 'x' }]) {
      expect((await user.put(`${url}/mapping`, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await user.put(`${url}/mapping`, { date: 0, amount: 1 })).status).toBe(202);
    expect((await user.put(`${url}/mapping`, { date: 0, amount: 1 })).status).toBe(409); // ya no espera el mapeo
    expect((await user.post('/api/analyses', { uploadId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await user.post('/api/analyses', {})).status).toBe(400);
    expect((await user.get('/api/analyses/no-es-uuid')).status).toBe(400);
    expect((await user.get(`${url}/export/todo`)).status).toBe(400);
  });

  it('carrera por el tope de 10 análisis: 12 a la vez → exactamente 10 pasan y 2 reciben 409', async () => {
    const up = await upload(csv('fecha,total', '2026-01-01,10'), 'tope.csv');
    const results = await Promise.all(Array.from({ length: 12 }, () => user.post('/api/analyses', { uploadId: up })));
    const count = (s: number) => results.filter((r) => r.status === s).length;
    expect({ aceptados: count(202), topados: count(409) }).toEqual({ aceptados: 10, topados: 2 });
    expect((await user.get('/api/analyses')).body.total).toBe(10);
    // Borrar el ARCHIVO borra en cascada todos sus análisis.
    await user.delete(`/api/uploads/${up}`);
    expect((await user.get('/api/analyses')).body.total).toBe(0);
  });

  it('v0.10 · tipo de análisis: ventas por omisión, gastos si se pide, y un tipo inventado es 400', async () => {
    const up = await upload(csv('fecha,total', '2026-01-01,10'), 'tipos.csv');
    const sales = await user.post('/api/analyses', { uploadId: up });
    const expenses = await user.post('/api/analyses', { uploadId: up, kind: 'expenses' });
    expect([sales.body.kind, expenses.body.kind]).toEqual(['sales', 'expenses']);
    expect(sales.body.insights).toBeNull(); // los indicadores solo existen con el análisis terminado
    expect((await user.post('/api/analyses', { uploadId: up, kind: 'ingresos' })).status).toBe(400);
    expect((await user.get(`/api/analyses/${expenses.body.id}`)).body.kind).toBe('expenses'); // y se conserva
  });

  it('v0.10 · /profit (ventas menos gastos): validaciones y control de acceso', async () => {
    const up = await upload(csv('fecha,total', '2026-01-01,10'), 'resultado.csv');
    const sales = (await user.post('/api/analyses', { uploadId: up })).body.id;
    const expenses = (await user.post('/api/analyses', { uploadId: up, kind: 'expenses' })).body.id;
    const url = (a: string, b: string) => `/api/profit?sales=${a}&expenses=${b}`;
    expect((await new Browser().get(url(sales, expenses))).status).toBe(401);
    expect((await user.get('/api/profit')).status).toBe(400); // faltan los dos
    expect((await user.get(url('x', 'y'))).status).toBe(400); // no son UUID
    expect((await user.get(`${url(sales, expenses)}&extra=1`)).status).toBe(400); // campo de más
    expect((await user.get(url(expenses, sales))).status).toBe(400); // al revés
    expect((await user.get(url(sales, sales))).status).toBe(400); // el mismo dos veces
    expect((await user.get(url(sales, expenses))).status).toBe(409); // todavía sin terminar
    // Lo ajeno y lo inexistente dan el MISMO 404, también para un admin, sin decir cuál de los dos falló.
    const ghost = '00000000-0000-4000-8000-000000000000';
    const admin = await loginAs('admin');
    const answers = await Promise.all([other.get(url(sales, expenses)), admin.get(url(sales, expenses)), user.get(url(sales, ghost)), user.get(url(ghost, expenses))]);
    expect(answers.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(answers.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it('un archivo que aún no está aceptado no se puede analizar (409)', async () => {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(Buffer.from('fecha,total\n'))], 'solo-encabezado.csv')); // el worker lo rechaza: vacío
    const up = (await user.postForm('/api/uploads', f)).body.id;
    await new Promise((r) => setTimeout(r, 2000));
    expect((await user.post('/api/analyses', { uploadId: up })).status).toBe(409);
  });
});

/** Un lector de CSV con comillas (lo bastante completo para los CSV que escribe el worker). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
