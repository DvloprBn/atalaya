// Pruebas de v0.6: a QUÉ cuenta de Atalaya corresponde una cuenta de Google (vincular, desactivar, 2FA).
// Ver docs/laboratorio/v0.6-google.md §5 y §6.
import { base32Decode, hotp, stepAt } from '../../src/auth/two-factor/totp.js';
import { FAILED, flow, meOf } from './google-helpers.js';
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const PASSWORD = 'una frase larga para el login con google';

describe('vincular Google a una cuenta que ya existe', () => {
  const email = uniqueEmail('vincular');
  const sub = `sub-${email}`;
  let admin: Browser;
  let userId: string;

  beforeAll(async () => {
    admin = new Browser();
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'TestOnly123!' });
    userId = (await admin.post('/api/admin/users', { email, roleName: 'staff' })).body.id;
    const token = tokenFrom(await waitForMail(email, 'Te crearon una cuenta'));
    expect((await new Browser().post('/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(200);
  });

  it('con el correo ya verificado se vincula, entra a ESA cuenta (rol staff) y se avisa al dueño por correo', async () => {
    const attempt = await flow({ x_email: email, x_sub: sub });
    expect(attempt.done.location).toBe('/cuenta');
    const me = await meOf(attempt.jar);
    expect(me.body.id).toBe(userId);
    expect(me.body.role.name).toBe('staff'); // la cuenta que ya existía, NO una nueva de usuario
    const mail = await waitForMail(email, 'Se vinculó Google a tu cuenta');
    expect(mail).toContain('restablece tu contraseña');
    // La contraseña original sigue sirviendo: vincular no la reemplaza.
    expect((await new Browser().post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
  });

  it('otra cuenta de Google con el MISMO correo no puede apoderarse de la cuenta ya vinculada', async () => {
    const intruder = await flow({ x_email: email, x_sub: `${sub}-intruso` });
    expect(intruder.done.location).toBe(FAILED);
    expect(intruder.jar.hasSession).toBe(false);
  });

  it('si la cuenta se desactiva, Google tampoco entra; al reactivarla, vuelve a entrar', async () => {
    await admin.post(`/api/admin/users/${userId}/disable`);
    const denied = await flow({ x_email: email, x_sub: sub });
    expect(denied.done.location).toBe(FAILED);
    expect(denied.jar.hasSession).toBe(false);
    await admin.post(`/api/admin/users/${userId}/enable`);
    expect((await flow({ x_email: email, x_sub: sub })).done.location).toBe('/cuenta');
  });

  it('con 2FA activo, Google NO lo salta: da un reto y la sesión nace al canjearlo con un código', async () => {
    const own = new Browser();
    await own.post('/api/auth/login', { email, password: PASSWORD });
    const setup = await own.post('/api/auth/2fa/setup', { password: PASSWORD });
    const code = hotp(base32Decode(setup.body.secret), stepAt(Date.now()));
    const enable = await own.post('/api/auth/2fa/enable', { code });
    expect(enable.status).toBe(200);

    const attempt = await flow({ x_email: email, x_sub: sub });
    expect(attempt.jar.hasSession).toBe(false); // todavía NO hay sesión
    expect(attempt.done.location).toMatch(/^\/login#challenge=[A-Za-z0-9_-]{43}$/); // el reto va en el fragmento (#)
    const challenge = attempt.done.location.split('challenge=')[1];

    const verify = new Browser();
    expect((await verify.post('/api/auth/2fa/verify', { challenge, code: 'zzzzzz' })).status).toBe(401);
    const ok = await verify.post('/api/auth/2fa/verify', { challenge, code: enable.body.recoveryCodes[0] });
    expect(ok.status).toBe(200);
    expect((await verify.get('/api/auth/me')).body.id).toBe(userId);
  });
});
