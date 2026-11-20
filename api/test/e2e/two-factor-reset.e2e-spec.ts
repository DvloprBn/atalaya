// S-10 · Recuperación asistida del 2FA contra el sistema VIVO. Ver docs/laboratorio/v1.0-recuperacion-2fa.md.
// En desarrollo y CI la espera es de 30 s (TWO_FACTOR_RESET_DELAY_S); en producción la API exige 48 h.
// Cuentas de la semilla: <rol>@example.com / TestOnly123!  (ninguna tiene 2FA)
import { base32Decode, hotp, stepAt } from '../../src/auth/two-factor/totp.js';
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const PASSWORD = 'violeta cobre nube 92 azul';
const REASON = 'Videollamada al número que ya teníamos en su expediente';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Anti-repetición: un paso de 30 s ya usado no vale otra vez. Se lleva la cuenta y se pide siempre uno posterior.
const lastStep = new Map<string, number>();
async function freshCode(secret: string): Promise<string> {
  for (;;) {
    const now = stepAt(Date.now());
    const step = Math.max((lastStep.get(secret) ?? -Infinity) + 1, now - 1);
    if (step <= now + 1) {
      lastStep.set(secret, step);
      return hotp(base32Decode(secret), step);
    }
    await sleep(2_000);
  }
}

async function login(email: string, password = 'TestOnly123!', secret?: string): Promise<Browser> {
  const b = new Browser();
  const res = await b.post('/api/auth/login', { email, password });
  if (secret) {
    const v = await b.post('/api/auth/2fa/verify', { challenge: res.body.challenge, code: await freshCode(secret) });
    if (v.status !== 200) throw new Error(`2FA de ${email}: ${v.status}`);
  } else if (res.status !== 200) throw new Error(`login de ${email}: ${res.status}`);
  return b;
}

/** Una cuenta nueva por invitación (la crea `by`), con contraseña y, si se pide, con 2FA activo. */
async function invited(by: Browser, role: string, withTwoFactor: boolean) {
  const email = uniqueEmail(`s10-${role}`);
  const created = await by.post('/api/admin/users', { email, roleName: role });
  if (created.status !== 201) throw new Error(`crear ${role}: ${created.status}`);
  await new Browser().post('/api/auth/accept-invite', { token: tokenFrom(await waitForMail(email, 'Te crearon una cuenta')), password: PASSWORD });
  if (!withTwoFactor) return { id: created.body.id as string, email, secret: undefined, recovery: [] as string[] };
  const b = await login(email, PASSWORD);
  const secret = (await b.post('/api/auth/2fa/setup', { password: PASSWORD })).body.secret as string;
  const enabled = await b.post('/api/auth/2fa/enable', { code: await freshCode(secret) });
  if (enabled.status !== 200) throw new Error('enable');
  return { id: created.body.id as string, email, secret, recovery: enabled.body.recoveryCodes as string[] };
}

describe('S-10 · recuperación asistida del 2FA (sistema vivo)', () => {
  let admin: Browser; // un admin CON 2FA (el que puede pedir restablecimientos)
  let adminInfo: Awaited<ReturnType<typeof invited>>;
  let target: Awaited<ReturnType<typeof invited>>; // staff con 2FA: quien «perdió el teléfono»
  // El admin se identifica con sus CÓDIGOS DE RECUPERACIÓN (la API los acepta igual que uno de la app): cada solicitud
  // gasta uno, y con TOTP la ventana de 3 pasos de 30 s obligaría a esperar entre solicitud y solicitud.
  const adminCode = () => adminInfo.recovery.pop() as string;
  const ask = async (reason = REASON) =>
    admin.post(`/api/admin/users/${target.id}/two-factor-reset`, { reason, password: PASSWORD, code: adminCode() });
  const state = async () => (await admin.get(`/api/admin/users/${target.id}`)).body.twoFactor as string;

  beforeAll(async () => {
    const superUser = await login('super@example.com');
    adminInfo = await invited(superUser, 'admin', true);
    admin = await login(adminInfo.email, PASSWORD, adminInfo.secret);
    target = await invited(admin, 'staff', true);
  }, 120_000);

  it('un admin SIN 2FA propio no puede pedirlo (403); con código o contraseña malos, tampoco', async () => {
    const plain = await login('admin@example.com');
    const res = await plain.post(`/api/admin/users/${target.id}/two-factor-reset`, { reason: REASON, password: 'TestOnly123!', code: '123456' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('activa primero el tuyo');
    expect((await admin.post(`/api/admin/users/${target.id}/two-factor-reset`, { reason: REASON, password: PASSWORD, code: '000000' })).status).toBe(403);
    // Contraseña mala: el código ni se mira (no se gasta), así que basta uno cualquiera.
    expect((await admin.post(`/api/admin/users/${target.id}/two-factor-reset`, { reason: REASON, password: 'otra', code: '000000' })).status).toBe(403);
    expect(await state()).toBe('on');
  });

  it('jerarquía: ni sobre sí mismo ni sobre alguien de su nivel o mayor (404, como el resto de /admin)', async () => {
    const self = await admin.post(`/api/admin/users/${adminInfo.id}/two-factor-reset`, { reason: REASON, password: PASSWORD, code: adminCode() });
    expect(self.status).toBe(404);
    const superId = (await (await login('super@example.com')).get('/api/auth/me')).body.id;
    const up = await admin.post(`/api/admin/users/${superId}/two-factor-reset`, { reason: REASON, password: PASSWORD, code: adminCode() });
    expect(up.status).toBe(404);
  });

  it('validación: motivo corto, campo extra (API3) y cuenta sin 2FA', async () => {
    expect((await ask('corto')).status).toBe(400);
    const extra = await admin.post(`/api/admin/users/${target.id}/two-factor-reset`, { reason: REASON, password: PASSWORD, code: '123456', effectiveAt: '2020-01-01' });
    expect(extra.status).toBe(400); // nadie fija la fecha desde fuera: la espera la pone el servidor
    const noTwoFactor = await invited(admin, 'staff', false);
    const res = await admin.post(`/api/admin/users/${noTwoFactor.id}/two-factor-reset`, { reason: REASON, password: PASSWORD, code: adminCode() });
    expect(res.status).toBe(409);
  }, 60_000);

  it('pedirlo NO lo aplica: 202, queda pendiente con su fecha, una sola a la vez, y a la persona le llega el enlace', async () => {
    const res = await ask();
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ twoFactor: 'reset_pending' });
    expect(new Date(res.body.twoFactorResetAt).getTime()).toBeGreaterThan(Date.now());
    expect((await ask()).status).toBe(409); // una pendiente por cuenta
    const mail = await waitForMail(target.email, 'quitar la verificación');
    expect(mail).toContain(REASON);
    expect(mail).toContain('/cancelar-2fa?token=');
  });

  it('la persona lo cancela con su enlace; el admin recibe el aviso; el enlace no sirve dos veces (misma respuesta)', async () => {
    const token = tokenFrom(await waitForMail(target.email, 'quitar la verificación'));
    const first = await new Browser().post('/api/auth/two-factor-reset/cancel', { token });
    expect(first.status).toBe(200);
    expect(await state()).toBe('on');
    expect(await waitForMail(adminInfo.email, 'canceló')).toContain(target.email);
    // Usado, inventado: misma respuesta (no se dice si el enlace servía).
    const again = await new Browser().post('/api/auth/two-factor-reset/cancel', { token });
    const fake = await new Browser().post('/api/auth/two-factor-reset/cancel', { token: 'A'.repeat(43) });
    expect(again).toEqual(first);
    expect(fake).toEqual(first);
  });

  it('si la persona ENTRA con su código mientras está pendiente, la solicitud se cae sola (suplantación frustrada)', async () => {
    expect((await ask()).status).toBe(202);
    await login(target.email, PASSWORD, target.secret);
    expect(await state()).toBe('on');
  });

  it('un admin puede cancelarla; cancelar sin pendiente es 409', async () => {
    expect((await ask()).status).toBe(202);
    expect((await admin.delete(`/api/admin/users/${target.id}/two-factor-reset`)).body.twoFactor).toBe('on');
    expect((await admin.delete(`/api/admin/users/${target.id}/two-factor-reset`)).status).toBe(409);
  });

  it('al vencer se APLICA: sin 2FA, todas sus sesiones cerradas, entra solo con contraseña, correo y auditoría', async () => {
    const victimSession = await login(target.email, PASSWORD, target.secret); // una sesión viva de la persona
    expect((await ask()).status).toBe(202);
    for (let i = 0; i < 60 && (await state()) !== 'off'; i++) await sleep(1_000);
    expect(await state()).toBe('off');

    expect((await victimSession.get('/api/auth/me')).status).toBe(401); // su sesión de antes ya no sirve
    const fresh = new Browser();
    const res = await fresh.post('/api/auth/login', { email: target.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.challenge).toBeUndefined(); // sin segundo paso: ya no tiene 2FA
    expect(await waitForMail(target.email, 'Se quitó la verificación')).toContain('vuelve a activar');

    const audit = (await (await login('super@example.com')).get('/api/admin/audit')).body.items as { action: string; actor: unknown; target: { email: string } | null }[];
    const mine = audit.filter((e) => e.target?.email === target.email).map((e) => e.action);
    expect(mine).toEqual(expect.arrayContaining(['two_factor_reset_requested', 'two_factor_reset_cancelled', 'two_factor_reset_applied']));
    expect(audit.find((e) => e.action === 'two_factor_reset_applied' && e.target?.email === target.email)?.actor).toBeNull();
  }, 120_000);
});
