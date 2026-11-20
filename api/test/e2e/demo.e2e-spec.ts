// v1.0 · La demo de 24 h (PLAN_DESARROLLO.md §6) contra el sistema VIVO. Solo corre con la demo encendida:
//   docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d api && npm run test:e2e -- demo
// Ahí una cuenta vive 90 s y caben 3 (docker-compose.demo.yml); sin la demo, esta suite se omite sola.
// Recorre: aviso (expiresAt), casilla obligatoria, cupos de 24 h, tope global, enlace que NO se gasta con la demo llena,
// cuenta vencida que ya no entra y el barrido que borra la fila Y los bytes del disco.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const PASSWORD = 'una frase de prueba para la demo';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const demo = await (await fetch(`${BASE_URL}/api/demo`)).json().catch(() => ({ enabled: false }));
const TTL_MS = demo.accountHours * 3600 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Los nombres de archivo de un volumen, vistos DESDE el contenedor (lo que la API no expone, a propósito). */
function filesIn(dir: '/data/uploads' | '/data/results'): Set<string> {
  const out = execFileSync('docker', ['compose', 'exec', '-T', 'api', 'ls', '-1', dir], { cwd: REPO, encoding: 'utf8' });
  return new Set(out.split('\n').filter(Boolean));
}

/** Registra un correo; si la demo está llena (de corridas anteriores), espera a que haya lugar. */
async function registerWhenRoom(email: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const res = await new Browser().post('/api/auth/register', { email, password: PASSWORD });
    if (res.status === 202) return;
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    await sleep(5_000);
  }
  throw new Error('la demo no tuvo lugar en 150 s');
}

async function linkFor(email: string): Promise<string> {
  return tokenFrom(await waitForMail(email, 'Confirma tu correo'));
}

async function login(email: string): Promise<{ browser: Browser; status: number; body: Record<string, unknown> }> {
  const browser = new Browser();
  const res = await browser.post('/api/auth/login', { email, password: PASSWORD });
  return { browser, status: res.status, body: res.body };
}

function form(bytes: string, name: string, fields: Record<string, string> = { noRealData: 'true' }): FormData {
  const f = new FormData();
  f.append('file', new File([new Uint8Array(Buffer.from(bytes))], name));
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const CSV = 'fecha,producto,importe\n2026-01-01,Café,10.50\n2026-01-02,Pan,20.00\n2026-01-03,Café,12.00\n';

describe.skipIf(!demo.enabled)('v1.0 · demo de 24 h (sistema vivo)', () => {
  const a = uniqueEmail('demo-a');
  let user: Browser;
  let createdAt = 0;
  const uploadsBefore = new Set<string>();
  const resultsBefore = new Set<string>();

  beforeAll(async () => {
    for (const f of filesIn('/data/uploads')) uploadsBefore.add(f);
    for (const f of filesIn('/data/results')) resultsBefore.add(f);
    await registerWhenRoom(a);
    const verified = await new Browser().post('/api/auth/verify-email', { token: await linkFor(a) });
    expect(verified.status).toBe(200);
    createdAt = Date.now();
    user = (await login(a)).browser;
  }, 200_000);

  it('/api/demo anuncia los límites (y nada de cuántas cuentas hay)', () => {
    expect(demo.limits).toEqual({ files: 10, megabytes: 5, rows: 50_000, uploadsPerDay: 30, analysesPerDay: 20 });
    expect(Object.keys(demo).sort()).toEqual(['accountHours', 'enabled', 'limits']);
  });

  it('la cuenta nace con su fecha de borrado (la del aviso): alta + la vida de la demo', async () => {
    const me = (await user.get('/api/auth/me')).body;
    const left = new Date(me.expiresAt).getTime() - createdAt;
    expect(Math.abs(left - TTL_MS)).toBeLessThan(10_000);
    // Las cuentas sembradas (permanentes) no tienen fecha.
    const admin = new Browser();
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'TestOnly123!' });
    expect((await admin.get('/api/auth/me')).body.expiresAt).toBeNull();
  });

  it('la casilla «sin datos reales» es obligatoria EN LA API (la pantalla sola se salta con curl)', async () => {
    expect((await user.postForm('/api/uploads', form(CSV, 'sin.csv', {}))).status).toBe(400);
    expect((await user.postForm('/api/uploads', form(CSV, 'no.csv', { noRealData: 'false' }))).status).toBe(400);
    expect((await user.postForm('/api/uploads', form(CSV, 'raro.csv', { noRealData: 'sí' }))).status).toBe(400);
    expect((await user.postForm('/api/uploads', form(CSV, 'otro.csv', { noRealData: 'true', role: 'super' }))).status).toBe(400);
  });

  it('cupo de 24 h: 20 análisis (borrar uno NO devuelve el cupo); el 21.º es 429', async () => {
    const up = await user.postForm('/api/uploads', form(CSV, 'ventas.csv'));
    expect(up.status, JSON.stringify(up.body)).toBe(202);
    for (let i = 0; i < 40 && (await user.get(`/api/uploads/${up.body.id}`)).body.status !== 'accepted'; i++) await sleep(400);

    for (let i = 1; i <= 19; i++) {
      const res = await user.post('/api/analyses', { uploadId: up.body.id });
      expect(res.status, `análisis ${i}`).toBe(202);
      await user.delete(`/api/analyses/${res.body.id}`);
    }
    // El 20.º se queda y termina: deja archivos de resultados en el disco para que el barrido tenga qué borrar.
    const kept = await user.post('/api/analyses', { uploadId: up.body.id });
    expect(kept.status).toBe(202);
    let a20 = kept.body;
    for (let i = 0; i < 60 && a20.status !== 'awaiting_mapping'; i++) (await sleep(400), (a20 = (await user.get(`/api/analyses/${a20.id}`)).body));
    await user.put(`/api/analyses/${a20.id}/mapping`, a20.preview.suggested);
    for (let i = 0; i < 60 && !['done', 'failed'].includes(a20.status); i++) (await sleep(400), (a20 = (await user.get(`/api/analyses/${a20.id}`)).body));
    expect(a20.status).toBe('done');

    const over = await user.post('/api/analyses', { uploadId: up.body.id });
    expect(over.status).toBe(429);
    expect(over.body.message).toContain('20 análisis cada 24 horas');
  }, 60_000);

  it('cupo de 24 h: 30 subidas (borrar NO devuelve el cupo); la 31.ª es 429. Las rechazadas por la casilla no cuentan', async () => {
    // Ya van 1 (ventas.csv); las 4 sin casilla de arriba no contaron.
    for (let i = 2; i <= 30; i++) {
      const res = await user.postForm('/api/uploads', form(CSV, `n${i}.csv`));
      expect(res.status, `subida ${i}`).toBe(202);
      await user.delete(`/api/uploads/${res.body.id}`);
    }
    const over = await user.postForm('/api/uploads', form(CSV, 'una-mas.csv'));
    expect(over.status).toBe(429);
    expect(over.body.message).toContain('30 subidas cada 24 horas');
  }, 60_000);

  // Un enlace de registro pedido con lugar, y abierto cuando ya no lo hay: 503 y el enlace NO se gasta.
  const pending = uniqueEmail('demo-p');
  let pendingLink = '';

  it('tope global: con la demo llena, registrarse es 503 (sin decir nada de nadie) y Google también se niega', async () => {
    await registerWhenRoom(pending);
    pendingLink = await linkFor(pending);
    // Se llena con cuentas nuevas hasta que el registro diga 503 (las que queden vivas de otra corrida también cuentan).
    for (let i = 0; i < 3; i++) {
      const email = uniqueEmail(`demo-f${i}`);
      const res = await new Browser().post('/api/auth/register', { email, password: PASSWORD });
      if (res.status === 503) break;
      expect((await new Browser().post('/api/auth/verify-email', { token: await linkFor(email) })).status).toBe(200);
    }
    const full = await new Browser().post('/api/auth/register', { email: uniqueEmail('demo-x'), password: PASSWORD });
    expect(full.status).toBe(503);
    expect(full.body.message).toContain('La demo está llena');
  }, 120_000);

  it('…y el enlace pedido antes es 503 sin gastarse: cuando se libera un lugar, el MISMO enlace crea la cuenta', async () => {
    const first = await new Browser().post('/api/auth/verify-email', { token: pendingLink });
    expect(first.status).toBe(503);
    let status = 0;
    for (let i = 0; i < 40 && status !== 200; i++) {
      await sleep(5_000);
      status = (await new Browser().post('/api/auth/verify-email', { token: pendingLink })).status;
      expect([200, 503]).toContain(status); // nunca 400: el enlace no se gastó
    }
    expect(status).toBe(200);
  }, 220_000);

  it('vencida: ya no entra ni con la sesión abierta, aunque el barrido todavía no la haya borrado', async () => {
    await sleep(Math.max(0, createdAt + TTL_MS + 1_000 - Date.now()));
    expect((await user.get('/api/auth/me')).status).toBe(401);
    expect((await login(a)).status).toBe(401);
  }, 120_000);

  it('el barrido borra la cuenta en cascada: la fila, los archivos subidos y los resultados del disco', async () => {
    // El barrido corre cada (vida / 2): a lo más 45 s después de vencer.
    const mine = (dir: '/data/uploads' | '/data/results', before: Set<string>) => [...filesIn(dir)].filter((f) => !before.has(f));
    let left: string[] = ['?'];
    for (let i = 0; i < 30 && left.length > 0; i++) {
      await sleep(3_000);
      left = [...mine('/data/uploads', uploadsBefore), ...mine('/data/results', resultsBefore)];
    }
    expect(left).toEqual([]);
    // La fila ya no existe: registrarse de nuevo con ese correo NO manda «Ya tienes una cuenta».
    await registerWhenRoom(a);
    await expect(waitForMail(a, 'Ya tienes una cuenta', 12_000)).rejects.toThrow('No llegó');
  }, 200_000);
});
