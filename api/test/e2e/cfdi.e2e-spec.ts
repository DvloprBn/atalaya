// v0.11 contra el sistema VIVO y con el worker REAL: CFDI en XML y en ZIP. El ataque de la fase: XXE y bombas de XML.
// Las cifras esperadas se calcularon a mano, aparte del código. Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser } from './helpers.js';
import { makeZip } from './zip.js';

// Un CFDI 4.0 mínimo con RFC de pruebas del SAT. Cada concepto: [descripción, cantidad, importe, descuento].
type Concept = [string, string, string, string];
function cfdi(o: { uuid: string; tipo?: string; moneda?: string; fecha?: string; concepts?: Concept[]; doctype?: string }): string {
  const items = (o.concepts ?? [['Latte', '2', '104.00', '']])
    .map(([d, q, i, dc]) => `<cfdi:Concepto ClaveProdServ="90101501" Cantidad="${q}" Descripcion="${d}" ValorUnitario="1.00" Importe="${i}"${dc ? ` Descuento="${dc}"` : ''}/>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>${o.doctype ?? ''}` +
    `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" ` +
    `Fecha="${o.fecha ?? '2026-03-15T10:30:00'}" TipoDeComprobante="${o.tipo ?? 'I'}" Moneda="${o.moneda ?? 'MXN'}" SubTotal="1.00" Total="1.00">` +
    `<cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE"/><cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL"/>` +
    `<cfdi:Conceptos>${items}</cfdi:Conceptos>` +
    `<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${o.uuid}" SelloCFD="FAKE"/></cfdi:Complemento></cfdi:Comprobante>`
  );
}
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const XXE = '<!DOCTYPE c [<!ENTITY x SYSTEM "file:///etc/passwd">]>';

describe('v0.11 · CFDI (sistema vivo, worker real)', () => {
  let user: Browser;

  async function send(bytes: Buffer | string, name: string) {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(Buffer.from(bytes))], name));
    const up = await user.postForm('/api/uploads', f);
    if (up.status !== 202) return { status: 'rejected', rejectReason: `http ${up.status}`, id: '' }; // la puerta de la API
    const pending = new Set(['queued', 'checking']);
    for (let i = 0; i < 40; i++) {
      const got = (await user.get(`/api/uploads/${up.body.id}`)).body;
      if (!pending.has(got.status)) return { ...got, id: up.body.id };
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

  const wipe = async (b: Browser) => {
    for (const u of (await b.get('/api/uploads')).body.items) await b.delete(`/api/uploads/${u.id}`);
  };

  beforeAll(async () => {
    user = new Browser();
    const res = await user.post('/api/auth/login', { email: 'usuario@example.com', password: 'TestOnly123!' });
    if (res.status !== 200) throw new Error(`login: ${res.status}`);
    await wipe(user);
  });
  afterEach(async () => wipe(user));

  it('un ZIP de comprobantes: ingreso, nota de crédito, un pago y uno en dólares → cifras exactas y todo contado', async () => {
    const zip = makeZip({
      'a.xml': cfdi({ uuid: uuid(1), concepts: [['Latte', '2', '104.00', ''], ['Croissant', '1', '42.00', '2.00']] }),
      'b.xml': cfdi({ uuid: uuid(2), tipo: 'E', concepts: [['Latte', '1', '52.00', '']] }),
      'c.xml': cfdi({ uuid: uuid(3), tipo: 'P', moneda: 'XXX' }),
      'd.xml': cfdi({ uuid: uuid(4), moneda: 'USD' }),
    });
    const up = await send(zip, 'mes.zip');
    expect(up.status).toBe('accepted');
    const created = await user.post('/api/analyses', { uploadId: up.id });
    expect(created.status).toBe(202);
    const ready = await until(created.body.id, 'awaiting_mapping', 'failed');
    expect(ready.status).toBe('awaiting_mapping');
    expect(ready.preview.suggested).toMatchObject({ date: 0, orderId: 1, product: 8, quantity: 9, amount: 10 });
    await user.put(`/api/analyses/${created.body.id}/mapping`, ready.preview.suggested);
    const done = await until(created.body.id, 'done', 'failed');
    expect(done.status).toBe('done');
    const r = done.report;
    // 104.00 + (42.00 − 2.00) − 52.00 = 92.00; 3 conceptos leídos + 2 comprobantes descartados
    expect(r).toMatchObject({ rowsRead: 5, rowsKept: 3, rowsDropped: 2, totalAmount: '92.00', dateFrom: '2026-03-15', dateTo: '2026-03-15' });
    expect(r.rowsKept + r.rowsDropped).toBe(r.rowsRead);
    const by = Object.fromEntries(r.issues.map((i: { code: string }) => [i.code, i]));
    expect(by.unsupported_document).toMatchObject({ count: 1, dropped: true });
    expect(by.unsupported_currency).toMatchObject({ count: 1, dropped: true });
    expect(by.negative_amount.count).toBe(1); // la nota de crédito es una devolución: se queda, con aviso
  });

  it('un .xml suelto (un solo CFDI) se analiza como una tabla de sus conceptos', async () => {
    const up = await send(cfdi({ uuid: uuid(9) }), 'uno.xml');
    expect(up.status).toBe('accepted');
    const id = (await user.post('/api/analyses', { uploadId: up.id })).body.id;
    const ready = await until(id, 'awaiting_mapping', 'failed');
    expect(ready.preview.rowCount).toBe(1);
    await user.put(`/api/analyses/${id}/mapping`, ready.preview.suggested);
    expect((await until(id, 'done', 'failed')).report).toMatchObject({ rowsKept: 1, totalAmount: '104.00' });
  });

  describe('XXE y XML hostil', () => {
    it('una entidad externa en un .xml suelto la ataja la PUERTA de la API (415), antes de guardar nada', async () => {
      const up = await send(cfdi({ uuid: uuid(5), doctype: XXE }), 'xxe.xml');
      expect(up).toMatchObject({ status: 'rejected', rejectReason: 'http 415' });
    });

    it('la misma entidad escondida DENTRO de un ZIP la ataja el worker (la API no abre zips)', async () => {
      const up = await send(makeZip({ 'a.xml': cfdi({ uuid: uuid(6) }), 'b.xml': cfdi({ uuid: uuid(7), doctype: XXE }) }), 'xxe.zip');
      expect(up.status).toBe('rejected');
      expect(up.rejectReason).toBe('corrupt');
    });

    it('«billion laughs» dentro de un ZIP se rechaza sin agotar el worker, y el worker sigue vivo después', async () => {
      const laughs =
        '<!DOCTYPE l [<!ENTITY a "ha"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;">]>';
      const bad = await send(makeZip({ 'a.xml': cfdi({ uuid: uuid(8), doctype: laughs }) }), 'risas.zip');
      expect(bad.status).toBe('rejected');
      const good = await send(cfdi({ uuid: uuid(10) }), 'despues.xml'); // prueba de vida: el worker sigue trabajando
      expect(good.status).toBe('accepted');
    });

    it('un XML que no es un CFDI, o una entrada que no es XML dentro del ZIP, se rechaza', async () => {
      expect((await send('<nota>hola</nota>', 'nota.xml')).rejectReason).toBe('http 415'); // la puerta exige «Comprobante»
      const mixed = await send(makeZip({ 'a.xml': cfdi({ uuid: uuid(11) }), 'foto.png': 'x' }), 'mixto.zip');
      expect(mixed.status).toBe('rejected');
    });

    it('un ZIP con más de 500 entradas se rechaza', async () => {
      const entries = Object.fromEntries(Array.from({ length: 501 }, (_, n) => [`${n}.xml`, cfdi({ uuid: uuid(1000 + n) })]));
      expect((await send(makeZip(entries), 'muchos.zip')).rejectReason).toBe('too_many_entries');
    });
  });
});
