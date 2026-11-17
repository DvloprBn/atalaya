// Pruebas de seguridad de v0.3 contra el sistema VIVO: control de acceso por
// función (OWASP API5), por objeto (API1), asignación masiva (API3) y escalada
// de privilegios. Ver docs/laboratorio/v0.3-roles.md.
// Usa las cuentas de la semilla: <rol>@example.com / TestOnly123!
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const SEED_PASSWORD = 'TestOnly123!';
const PASSWORD = 'una frase larga para la invitacion';

async function loginAs(role: string): Promise<Browser> {
  const browser = new Browser();
  const res = await browser.post('/api/auth/login', { email: `${role}@example.com`, password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`No se pudo entrar como ${role}: ${res.status}`);
  return browser;
}

/** El id de una cuenta, buscándola con alguien que sí la puede ver. */
async function idOf(viewer: Browser, email: string): Promise<string> {
  const res = await viewer.get(`/api/admin/users?q=${encodeURIComponent(email)}`);
  const user = res.body.items.find((u: { email: string }) => u.email === email);
  if (!user) throw new Error(`${email} no aparece`);
  return user.id;
}

describe('v0.3 · roles y admin (sistema vivo)', () => {
  let admin: Browser;
  let sup: Browser;

  beforeAll(async () => {
    admin = await loginAs('admin');
    sup = await loginAs('super');
  });

  it('sin sesión 401; usuario, staff y manager 403 (función por nivel, API5)', async () => {
    expect((await new Browser().get('/api/admin/users')).status).toBe(401);
    for (const role of ['usuario', 'staff', 'manager']) {
      expect((await (await loginAs(role)).get('/api/admin/users')).status, role).toBe(403);
    }
  });

  it('el admin solo ve cuentas por debajo de su nivel', async () => {
    const res = await admin.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.items.every((u: { role: { level: number } }) => u.role.level < 3)).toBe(true);
    const roles = (await admin.get('/api/admin/roles')).body.map((r: { name: string }) => r.name);
    expect(roles).toEqual(['usuario', 'staff', 'manager']);
  });

  it('IDOR: con el id de una cuenta de arriba (o la propia) responde 404, como si no existiera', async () => {
    const directorId = await idOf(sup, 'director@example.com');
    const adminId = await idOf(sup, 'admin@example.com');
    expect((await admin.get(`/api/admin/users/${directorId}`)).status).toBe(404);
    expect((await admin.post(`/api/admin/users/${directorId}/disable`)).status).toBe(404);
    expect((await admin.get(`/api/admin/users/${adminId}`)).status).toBe(404); // a sí mismo tampoco
    expect((await admin.get('/api/admin/users/no-es-un-uuid')).status).toBe(400);
  });

  it('escalada: un admin no crea ni asciende a admin o más', async () => {
    const staffId = await idOf(admin, 'staff@example.com');
    for (const roleName of ['admin', 'director', 'super']) {
      expect((await admin.post('/api/admin/users', { email: uniqueEmail('esc'), roleName })).status, roleName).toBe(403);
    }
    expect((await admin.patch(`/api/admin/users/${staffId}/role`, { roleName: 'admin' })).status).toBe(403);
    expect((await admin.patch(`/api/admin/users/${staffId}/role`, { roleName: 'manager' })).status).toBe(200);
    expect((await admin.patch(`/api/admin/users/${staffId}/role`, { roleName: 'staff' })).status).toBe(200); // se deja como estaba
  });

  it('asignación masiva al crear: un campo extra se rechaza (API3)', async () => {
    const res = await admin.post('/api/admin/users', { email: uniqueEmail('mass'), roleName: 'staff', emailVerifiedAt: '2020-01-01' });
    expect(res.status).toBe(400);
  });

  it('invitación → la persona elige su contraseña → entra; desactivar corta al instante y reactivar no revive la sesión', async () => {
    const email = uniqueEmail('invitado');
    const created = await admin.post('/api/admin/users', { email, roleName: 'staff' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('invited');
    expect((await new Browser().post('/api/auth/login', { email, password: PASSWORD })).status).toBe(401);

    const token = tokenFrom(await waitForMail(email, 'Te crearon una cuenta'));
    expect((await new Browser().post('/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(200);
    expect((await new Browser().post('/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(400);

    const person = new Browser();
    expect((await person.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
    expect((await person.get('/api/auth/me')).body.role.name).toBe('staff');

    expect((await admin.post(`/api/admin/users/${created.body.id}/disable`)).body.status).toBe('disabled');
    expect((await person.get('/api/auth/me')).status).toBe(401);
    expect((await admin.post(`/api/admin/users/${created.body.id}/enable`)).body.status).toBe('active');
    expect((await person.get('/api/auth/me')).status).toBe(401); // la sesión vieja no revive
    expect((await new Browser().post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
  });

  it('un solo director activo: con uno ya activo, 409; y dos altas A LA VEZ sin director, solo una gana', async () => {
    expect((await sup.post('/api/admin/users', { email: uniqueEmail('dir'), roleName: 'director' })).status).toBe(409);

    const seededDirector = await idOf(sup, 'director@example.com');
    await sup.post(`/api/admin/users/${seededDirector}/disable`);
    try {
      const [a, b] = await Promise.all([
        sup.post('/api/admin/users', { email: uniqueEmail('dir-a'), roleName: 'director' }),
        sup.post('/api/admin/users', { email: uniqueEmail('dir-b'), roleName: 'director' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const winner = a.status === 201 ? a.body.id : b.body.id;
      await sup.post(`/api/admin/users/${winner}/disable`); // deja el lugar libre otra vez
    } finally {
      expect((await sup.post(`/api/admin/users/${seededDirector}/enable`)).status).toBe(200);
    }
  });
});
