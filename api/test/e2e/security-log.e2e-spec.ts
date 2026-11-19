// Pruebas de v0.7 contra el sistema VIVO: la bitácora de seguridad, la auditoría y el recolector
// de CSP. Lo que se comprueba es lo que importa de un registro: que los hechos reales queden,
// que el visitante no vea nada de él, que no filtre datos y que nadie pueda llenarlo.
// Ver docs/laboratorio/v0.7-bitacora.md. Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const SEED_PASSWORD = 'TestOnly123!';
const PASSWORD = 'una frase larga para la bitacora';

async function loginAs(role: string): Promise<Browser> {
  const browser = new Browser();
  const res = await browser.post('/api/auth/login', { email: `${role}@example.com`, password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`No se pudo entrar como ${role}: ${res.status}`);
  return browser;
}

type Ev = { type: string; detail: string | null; source: string | null; user: { email: string } | null; createdAt: string };
const events = async (who: Browser, type: string): Promise<Ev[]> => (await who.get(`/api/admin/security/events?type=${type}`)).body.items;

describe('v0.7 · bitácora de seguridad (sistema vivo)', () => {
  let admin: Browser;
  let sup: Browser;

  beforeAll(async () => {
    admin = await loginAs('admin');
    sup = await loginAs('super');
  });

  it('solo el admin (nivel 3+) lee la bitácora, el resumen y la auditoría', async () => {
    for (const path of ['/api/admin/security/events', '/api/admin/security/summary', '/api/admin/audit']) {
      expect((await new Browser().get(path)).status, path).toBe(401);
      for (const role of ['usuario', 'staff', 'manager']) expect((await (await loginAs(role)).get(path)).status, `${role} ${path}`).toBe(403);
      expect((await admin.get(path)).status, path).toBe(200);
    }
  });

  it('entradas inválidas se rechazan con 400, no con 500', async () => {
    for (const q of ['type=no_existe', 'page=0', 'page=abc', "type=login_failed'%20OR%201=1"]) {
      expect((await admin.get(`/api/admin/security/events?${q}`)).status, q).toBe(400);
    }
  });

  it('un login fallido deja su renglón con el motivo real, sin IP en claro ni datos de la persona', async () => {
    const wrong = `incorrecta-${Date.now()}`;
    const res = await new Browser().post('/api/auth/login', { email: 'usuario@example.com', password: wrong });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Correo o contraseña incorrectos'); // a quien intenta no se le dice el motivo

    const mine = (await events(admin, 'login_failed')).find((e) => e.detail === 'bad_password' && e.user?.email === 'usuario@example.com');
    expect(mine).toBeDefined();
    expect(mine?.source).toMatch(/^[0-9a-f]{8}$/); // solo un prefijo del HMAC
    const raw = JSON.stringify((await admin.get('/api/admin/security/events')).body);
    expect(raw).not.toContain(wrong); // la contraseña intentada no se guarda jamás
    expect(raw).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/); // ninguna IP en claro
  });

  it('una cuenta inexistente también queda, pero sin cuenta asociada ni el correo que se escribió', async () => {
    const ghost = uniqueEmail('fantasma');
    await new Browser().post('/api/auth/login', { email: ghost, password: 'x'.repeat(14) });
    const all = await events(admin, 'login_failed');
    expect(all.some((e) => e.detail === 'unknown_account' && e.user === null)).toBe(true);
    expect(JSON.stringify(all)).not.toContain(ghost);
  });

  it('jerarquía (API1): el admin ve el evento de una cuenta superior (el director) pero SIN la cuenta; el super sí la ve', async () => {
    await new Browser().post('/api/auth/login', { email: 'director@example.com', password: `mala-${Date.now()}` });
    const seenByAdmin = (await events(admin, 'login_failed')).filter((e) => e.detail === 'bad_password' && e.user === null);
    expect(seenByAdmin.length).toBeGreaterThan(0);
    expect((await events(sup, 'login_failed')).some((e) => e.user?.email === 'director@example.com')).toBe(true);
    await loginAs('director'); // un acceso bueno limpia el contador de fallos de la cuenta
  });

  it('S-7: un refresh robado cierra las sesiones, queda en la bitácora y se AVISA por correo al dueño', async () => {
    const email = uniqueEmail('robo');
    await admin.post('/api/admin/users', { email, roleName: 'usuario' });
    const token = tokenFrom(await waitForMail(email, 'Te crearon una cuenta'));
    await new Browser().post('/api/auth/accept-invite', { token, password: PASSWORD });

    const victim = new Browser();
    expect((await victim.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
    const r1 = victim.snapshot();
    expect((await victim.post('/api/auth/refresh')).status).toBe(204); // r1 → r2
    expect((await victim.post('/api/auth/refresh')).status).toBe(204); // r2 → r3: la cadena avanzó

    const thief = new Browser();
    r1.forEach((v, k) => thief.cookies.set(k, v));
    expect((await thief.post('/api/auth/refresh')).status).toBe(401); // r1 reaparece = robo
    expect((await victim.post('/api/auth/refresh')).status).toBe(401); // y la víctima también queda fuera

    expect((await events(admin, 'refresh_reuse')).some((e) => e.user?.email === email)).toBe(true);
    const notice = await waitForMail(email, 'Cerramos tus sesiones');
    expect(notice).toContain('cerramos todas tus sesiones');
    expect(notice).not.toMatch(/token=|[A-Za-z0-9_-]{43}/); // el aviso no lleva ningún token ni enlace con secreto
  });

  it('auditoría: crear y cambiar de rol quedan con quién lo hizo, y en orden', async () => {
    const email = uniqueEmail('auditada');
    // Las acciones las hace el SUPER: así se comprueba que un admin ve la acción pero no quién la hizo (está por encima).
    const created = await sup.post('/api/admin/users', { email, roleName: 'staff' });
    expect((await sup.patch(`/api/admin/users/${created.body.id}/role`, { roleName: 'manager' })).status).toBe(200);
    await sup.post(`/api/admin/users/${created.body.id}/disable`);

    const items = (await admin.get('/api/admin/audit')).body.items as { action: string; detail: string | null; actor: { email: string } | null; target: { email: string } | null }[];
    const mine = items.filter((i) => i.target?.email === email).map((i) => `${i.action}:${i.detail ?? ''}`);
    expect(mine).toEqual(['user_disabled:', 'role_changed:manager', 'user_created:staff']); // lo más reciente primero
    expect(items.find((i) => i.target?.email === email)?.actor).toBeNull(); // el actor está por encima del admin: oculto
    const bySuper = (await sup.get('/api/admin/audit')).body.items as { actor: { email: string } | null; target: { email: string } | null }[];
    expect(bySuper.find((i) => i.target?.email === email)?.actor?.email).toBe('super@example.com'); // y es suya: la ve
  });

  it('el resumen trae 14 días seguidos, incluidos los sin eventos, y hoy cuenta lo de arriba', async () => {
    const { days } = (await admin.get('/api/admin/security/summary')).body;
    expect(days).toHaveLength(14);
    expect(new Set(days.map((d: { date: string }) => d.date)).size).toBe(14);
    const today = days.at(-1);
    expect(today.date).toBe(new Date().toISOString().slice(0, 10));
    expect(today.byType.login_failed).toBeGreaterThan(0);
    expect(today.total).toBe(Object.values<number>(today.byType).reduce((a, b) => a + b, 0));
  });
});

describe('v0.7 · recolector de reportes CSP (público, sin sesión)', () => {
  const send = (body: string, type = 'application/csp-report') =>
    fetch(`${process.env.ATALAYA_URL ?? 'http://127.0.0.1:3070'}/api/csp-report`, { method: 'POST', headers: { 'content-type': type }, body });
  let admin: Browser;
  beforeAll(async () => {
    admin = await loginAs('admin');
  });

  it('guarda directiva y HOST; nunca la ruta, los parámetros ni el fragmento', async () => {
    const host = `h-${Math.random().toString(36).slice(2, 8)}.example`;
    const report = { 'csp-report': { 'effective-directive': 'script-src-elem', 'blocked-uri': `https://${host}/x.js?token=SECRETO`, 'document-uri': 'http://localhost/login#challenge=ABC' } };
    expect((await send(JSON.stringify(report))).status).toBe(204);
    const mine = (await events(admin, 'csp_violation')).filter((e) => e.detail?.includes(host));
    expect(mine).toHaveLength(1);
    expect(mine[0].detail).toBe(`script-src-elem ${host}`);
    expect(JSON.stringify(mine)).not.toMatch(/SECRETO|challenge/);
  });

  it('el mismo reporte repetido 5 veces en un minuto deja UN renglón (no se puede llenar la bitácora)', async () => {
    const host = `dup-${Math.random().toString(36).slice(2, 8)}.example`;
    const body = JSON.stringify({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': `https://${host}/a.png` } });
    for (let i = 0; i < 5; i++) expect((await send(body)).status).toBe(204);
    expect((await events(admin, 'csp_violation')).filter((e) => e.detail?.includes(host))).toHaveLength(1);
  });

  it('también entiende el formato nuevo (Reporting API)', async () => {
    const host = `new-${Math.random().toString(36).slice(2, 8)}.example`;
    const body = JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'font-src', blockedURL: `https://${host}/f.woff2` } }]);
    expect((await send(body, 'application/reports+json')).status).toBe(204);
    expect((await events(admin, 'csp_violation')).some((e) => e.detail === `font-src ${host}`)).toBe(true);
  });

  it('un JSON que no es un reporte responde 204 igual (no se le dice nada a quien manda) y no escribe nada', async () => {
    const before = (await admin.get('/api/admin/security/events?type=csp_violation')).body.total;
    for (const junk of ['{}', '[]', '{"csp-report":"x"}', '[1,2]', '{"csp-report":{"blocked-uri":"https://a.example"}}']) {
      expect((await send(junk)).status, junk).toBe(204);
    }
    expect((await admin.get('/api/admin/security/events?type=csp_violation')).body.total).toBe(before);
  });

  it('lo que ni siquiera es un objeto JSON lo rechaza el analizador con 400 (nunca 500)', async () => {
    for (const junk of ['null', '"texto"', '42', 'no es json']) expect((await send(junk)).status, junk).toBe(400);
  });

  it('un cuerpo gigante se corta con 413 antes de procesarse (límite de 16 KB, API4)', async () => {
    const huge = JSON.stringify({ 'csp-report': { 'effective-directive': 'x', 'blocked-uri': 'a'.repeat(40_000) } });
    expect((await send(huge)).status).toBe(413);
  });
});
