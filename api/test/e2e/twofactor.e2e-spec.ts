// Pruebas de seguridad de v0.5 contra el sistema VIVO: el segundo factor (OWASP API2).
// Ver docs/laboratorio/v0.5-2fa.md. La cuenta de prueba se crea con una invitación del admin
// de la semilla (así no gasta el tope de registros por IP) y es SOLO de esta suite.
//
// Un detalle que enseña: activar el 2FA GASTA el código de ese instante (anti-repetición), y
// la ventana solo admite el paso anterior, el actual y el siguiente. Por eso el primer inicio de
// sesión usa el código del SIGUIENTE paso, y de ahí en adelante las pruebas usan códigos de
// recuperación.
import { base32Decode, hotp, stepAt } from '../../src/auth/two-factor/totp.js';
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const PASSWORD = 'una frase larga para el segundo factor';
const email = uniqueEmail('dosfa');
const RECOVERY_FORMAT = /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/;

let secret: string;
let codes: string[];
// El código TOTP de un paso: 0 = el actual, 1 = el siguiente, -1 = el anterior.
const totp = (offset = 0) => hotp(base32Decode(secret), stepAt(Date.now()) + offset);

async function loginForChallenge(): Promise<string> {
  const res = await new Browser().post('/api/auth/login', { email, password: PASSWORD });
  expect(res.status).toBe(200);
  expect(res.body.twoFactorRequired).toBe(true);
  return res.body.challenge;
}

describe('v0.5 · segundo factor (sistema vivo)', () => {
  let session: Browser;
  let spentChallenge: string;
  let challenge2: string;
  let challenge3: string;

  beforeAll(async () => {
    const admin = new Browser();
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'TestOnly123!' });
    expect((await admin.post('/api/admin/users', { email, roleName: 'usuario' })).status).toBe(201);
    const token = tokenFrom(await waitForMail(email, 'Te crearon una cuenta'));
    expect((await new Browser().post('/api/auth/accept-invite', { token, password: PASSWORD })).status).toBe(200);
  });

  it('activar pide la contraseña, solo cuenta al confirmar con un código, y cierra las demás sesiones', async () => {
    session = new Browser();
    const other = new Browser();
    expect((await session.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
    expect((await other.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);

    expect((await session.post('/api/auth/2fa/setup', { password: 'incorrecta' })).status).toBe(403);
    const setup = await session.post('/api/auth/2fa/setup', { password: PASSWORD });
    expect(setup.status).toBe(200);
    secret = setup.body.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);
    expect(setup.body.qrSvg.startsWith('<svg')).toBe(true);
    expect((await session.get('/api/auth/2fa')).body).toEqual({ enabled: false, recoveryCodesLeft: 0 }); // pendiente ≠ activo

    expect((await session.post('/api/auth/2fa/enable', { code: totp(5) })).status).toBe(403); // código de otro momento
    const enable = await session.post('/api/auth/2fa/enable', { code: totp(0) });
    expect(enable.status).toBe(200);
    codes = enable.body.recoveryCodes;
    expect(codes).toHaveLength(10);
    for (const code of codes) expect(code).toMatch(RECOVERY_FORMAT);
    expect((await session.get('/api/auth/2fa')).body).toEqual({ enabled: true, recoveryCodesLeft: 10 });

    expect((await other.get('/api/auth/me')).status).toBe(401); // la otra sesión quedó fuera
    expect((await session.get('/api/auth/me')).status).toBe(200); // la que activó, sigue
    expect((await session.post('/api/auth/2fa/setup', { password: PASSWORD })).status).toBe(409); // ya activo
  });

  it('con 2FA, la contraseña sola NO abre sesión: da un reto, y solo el código lo canjea', async () => {
    const browser = new Browser();
    const login = await browser.post('/api/auth/login', { email, password: PASSWORD });
    expect(login.body).toMatchObject({ twoFactorRequired: true });
    expect(login.body.user).toBeUndefined();
    expect(browser.cookies.size).toBe(0); // ninguna cookie: todavía no hay sesión
    expect((await browser.get('/api/auth/me')).status).toBe(401);

    spentChallenge = login.body.challenge;
    const wrong = await browser.post('/api/auth/2fa/verify', { challenge: spentChallenge, code: 'zzzzzz' });
    expect(wrong.status).toBe(401);
    const ok = await browser.post('/api/auth/2fa/verify', { challenge: spentChallenge, code: totp(1) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);
    expect((await browser.get('/api/auth/me')).status).toBe(200);
  });

  it('un código TOTP ya usado no sirve otra vez, ni el del paso anterior (anti-repetición, RFC 6238)', async () => {
    challenge2 = await loginForChallenge();
    const browser = new Browser();
    expect((await browser.post('/api/auth/2fa/verify', { challenge: challenge2, code: totp(1) })).status).toBe(401);
    expect((await browser.post('/api/auth/2fa/verify', { challenge: challenge2, code: totp(0) })).status).toBe(401);
    expect(browser.cookies.size).toBe(0);
  });

  it('un reto ya gastado no se puede reusar, y el código que se le dio NO se quema', async () => {
    const browser = new Browser();
    expect((await browser.post('/api/auth/2fa/verify', { challenge: spentChallenge, code: codes[0] })).status).toBe(401);
    // codes[0] sigue sin usar: el siguiente paso lo demuestra.
  });

  it('un código de recuperación entra (con guiones, sin ellos o en minúsculas) y sirve UNA sola vez', async () => {
    const browser = new Browser();
    const loose = codes[0].replaceAll('-', '').toLowerCase();
    expect((await browser.post('/api/auth/2fa/verify', { challenge: challenge2, code: loose })).status).toBe(200);
    expect((await browser.get('/api/auth/me')).status).toBe(200);
    expect((await session.get('/api/auth/2fa')).body.recoveryCodesLeft).toBe(9);

    challenge3 = await loginForChallenge();
    expect((await new Browser().post('/api/auth/2fa/verify', { challenge: challenge3, code: codes[0] })).status).toBe(401);
  });

  it('un reto aguanta 5 intentos malos y se destruye: ni el código correcto lo salva', async () => {
    // Ya hubo 1 intento malo en challenge3 (el código reusado); 4 más completan 5.
    for (let i = 0; i < 4; i++) {
      expect((await new Browser().post('/api/auth/2fa/verify', { challenge: challenge3, code: 'zzzzzz' })).status).toBe(401);
    }
    const browser = new Browser();
    expect((await browser.post('/api/auth/2fa/verify', { challenge: challenge3, code: codes[1] })).status).toBe(401);
    expect(browser.cookies.size).toBe(0);
  });

  it('carrera: dos peticiones a la vez con el mismo reto y el mismo código dan UNA sola sesión', async () => {
    const challenge = await loginForChallenge();
    const [a, b] = [new Browser(), new Browser()];
    const [first, second] = await Promise.all([
      a.post('/api/auth/2fa/verify', { challenge, code: codes[3] }),
      b.post('/api/auth/2fa/verify', { challenge, code: codes[3] }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    expect(a.cookies.size + b.cookies.size).toBe(2); // las dos cookies de UNA sola sesión
  });

  it('carrera con dos códigos DISTINTOS y el mismo reto: el reto se gasta una sola vez, hay UNA sesión', async () => {
    const challenge = await loginForChallenge();
    const [a, b] = [new Browser(), new Browser()];
    const [first, second] = await Promise.all([
      a.post('/api/auth/2fa/verify', { challenge, code: codes[4] }),
      b.post('/api/auth/2fa/verify', { challenge, code: codes[5] }),
    ]);
    // Los dos códigos eran buenos; lo que decide es quién gana el reto (GETDEL atómico).
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    expect(a.cookies.size + b.cookies.size).toBe(2);
  });

  it('regenerar pide contraseña Y código; los códigos anteriores dejan de servir', async () => {
    expect((await session.post('/api/auth/2fa/recovery-codes', { password: 'incorrecta', code: codes[2] })).status).toBe(403);
    const fresh = await session.post('/api/auth/2fa/recovery-codes', { password: PASSWORD, code: codes[2] });
    expect(fresh.status).toBe(200);
    expect(fresh.body.recoveryCodes).toHaveLength(10);
    expect(fresh.body.recoveryCodes).not.toContain(codes[1]);
    expect((await session.post('/api/auth/2fa/disable', { password: PASSWORD, code: codes[1] })).status).toBe(403); // el viejo, muerto
    codes = fresh.body.recoveryCodes;
  });

  it('desactivar pide contraseña Y código (uno solo no basta); después se entra sin segundo paso', async () => {
    expect((await session.post('/api/auth/2fa/disable', { password: 'incorrecta', code: codes[0] })).status).toBe(403);
    expect((await session.post('/api/auth/2fa/disable', { password: PASSWORD, code: 'zzzzzz' })).status).toBe(403);
    expect((await session.post('/api/auth/2fa/disable', { password: PASSWORD, code: codes[0] })).status).toBe(200);
    expect((await session.get('/api/auth/2fa')).body).toEqual({ enabled: false, recoveryCodesLeft: 0 });

    const plain = await new Browser().post('/api/auth/login', { email, password: PASSWORD });
    expect(plain.status).toBe(200);
    expect(plain.body.user.email).toBe(email);
  });

  it('las rutas de gestión exigen sesión; sin ella, 401', async () => {
    const nobody = new Browser();
    expect((await nobody.get('/api/auth/2fa')).status).toBe(401);
    expect((await nobody.post('/api/auth/2fa/setup', { password: PASSWORD })).status).toBe(401);
    expect((await nobody.post('/api/auth/2fa/disable', { password: PASSWORD, code: '123456' })).status).toBe(401);
  });
});
