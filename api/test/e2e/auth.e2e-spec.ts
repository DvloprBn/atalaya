// Pruebas de seguridad de v0.2 contra el sistema VIVO (OWASP API2: autenticación rota).
// Cada prueba es un ataque o un abuso concreto; ver docs/laboratorio/ para el porqué.
//
//   docker compose up -d --build && npm run test:e2e
//
// Ojo: las rutas de acceso tienen topes por IP (registro 5 y recuperar 3 cada 15 min).
// Esta suite cabe en ellos UNA vez cada 15 minutos; para repetir antes: docker compose restart api.
import { Browser, tokenFrom, uniqueEmail, waitForMail } from './helpers.js';

const PASSWORD = 'una frase larga de prueba';
const NEW_PASSWORD = 'otra frase distinta y larga';
const email = uniqueEmail('flujo');

describe('v0.2 · acceso (sistema vivo)', () => {
  it('registro: misma respuesta exista o no la cuenta (sin enumeración)', async () => {
    const fresh = await new Browser().post('/api/auth/register', { email, password: PASSWORD });
    const taken = await new Browser().post('/api/auth/register', { email: 'usuario@example.com', password: PASSWORD });
    expect(fresh.status).toBe(202);
    expect(taken).toEqual(fresh);
  });

  it('registrarse NO crea la cuenta: sin abrir el enlace no se puede entrar (sin pre-secuestro)', async () => {
    const res = await new Browser().post('/api/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('el enlace del correo crea la cuenta y sirve UNA sola vez', async () => {
    const token = tokenFrom(await waitForMail(email, 'Confirma tu correo'));
    expect((await new Browser().post('/api/auth/verify-email', { token })).status).toBe(200);
    expect((await new Browser().post('/api/auth/verify-email', { token })).status).toBe(400);
  });

  it('un campo extra como "role" se rechaza (asignación masiva, OWASP API3)', async () => {
    const res = await new Browser().post('/api/auth/register', { email, password: PASSWORD, role: 'super' });
    expect(res.status).toBe(400);
  });

  it('refresh robado: reusarlo después de que la cadena avanzó cierra TODAS las sesiones', async () => {
    const victim = new Browser();
    expect((await victim.post('/api/auth/login', { email, password: PASSWORD })).status).toBe(200);
    const stolen = victim.snapshot(); // el ladrón copia las cookies (r1)

    expect((await victim.post('/api/auth/refresh')).status).toBe(204); // r1 → r2
    // Carrera legítima (r1 reaparece al instante y r2 sigue sin usarse): 401, pero NO se castiga.
    const race = new Browser();
    stolen.forEach((v, k) => race.cookies.set(k, v));
    expect((await race.post('/api/auth/refresh')).status).toBe(401);
    expect((await victim.get('/api/auth/me')).status).toBe(200);

    expect((await victim.post('/api/auth/refresh')).status).toBe(204); // r2 → r3: la cadena avanzó
    const thief = new Browser();
    stolen.forEach((v, k) => thief.cookies.set(k, v));
    expect((await thief.post('/api/auth/refresh')).status).toBe(401); // r1 otra vez = robo
    expect((await victim.get('/api/auth/me')).status).toBe(401); // la víctima también queda fuera
  });

  it('logout corta el acceso al instante, aunque al token le queden minutos', async () => {
    const user = new Browser();
    await user.post('/api/auth/login', { email, password: PASSWORD });
    const copy = user.snapshot();
    expect((await user.post('/api/auth/logout')).status).toBe(204);
    const replay = new Browser();
    copy.forEach((v, k) => replay.cookies.set(k, v));
    expect((await replay.get('/api/auth/me')).status).toBe(401);
    expect((await replay.post('/api/auth/refresh')).status).toBe(401);
  });

  it('restablecer la contraseña cierra TODAS las sesiones y la vieja deja de servir', async () => {
    const phone = new Browser();
    const laptop = new Browser();
    await phone.post('/api/auth/login', { email, password: PASSWORD });
    await laptop.post('/api/auth/login', { email, password: PASSWORD });

    const forgot = await new Browser().post('/api/auth/forgot-password', { email });
    const ghost = await new Browser().post('/api/auth/forgot-password', { email: uniqueEmail('nadie') });
    expect(forgot.status).toBe(202);
    expect(ghost).toEqual(forgot); // misma respuesta para un correo sin cuenta

    const token = tokenFrom(await waitForMail(email, 'Restablece tu contraseña'));
    expect((await new Browser().post('/api/auth/reset-password', { token, password: NEW_PASSWORD })).status).toBe(200);

    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(401);
    expect((await new Browser().post('/api/auth/login', { email, password: PASSWORD })).status).toBe(401);
    expect((await new Browser().post('/api/auth/login', { email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('CSRF: una petición que otro sitio dispara desde el navegador se rechaza', async () => {
    const crossSite = await new Browser().post('/api/auth/logout', undefined, { 'sec-fetch-site': 'cross-site' });
    const evilOrigin = await new Browser().post('/api/auth/logout', undefined, { origin: 'https://evil.example' });
    expect(crossSite.status).toBe(403);
    expect(evilOrigin.status).toBe(403);
  });

  it('el byte nulo se rechaza con 400, no revienta la base con 500', async () => {
    const res = await new Browser().post('/api/auth/forgot-password', { email: 'a\u0000@example.com' });
    expect(res.status).toBe(400);
  });
});
