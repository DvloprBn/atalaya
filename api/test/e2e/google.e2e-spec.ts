// Pruebas de seguridad de v0.6 contra el sistema VIVO: el protocolo del login con Google (OWASP API2, API7, API10).
// Ver docs/laboratorio/v0.6-google.md. Google lo hace el servidor OAuth FALSO (carpeta mock-idp/),
// que además puede falsificar el id_token a propósito con `x_fault`.
import { APP, BINDING, FAILED, flow, hop, Jar, meOf } from './google-helpers.js';
import { Browser, uniqueEmail } from './helpers.js';


describe('v0.6 · login con Google (sistema vivo)', () => {
  it('/auth/providers dice que Google está configurado', async () => {
    const res = await fetch(`${APP}/api/auth/providers`);
    expect(await res.json()).toEqual({ google: true });
  });

  it('start: redirige a Google con PKCE S256, state, nonce y redirect_uri exacto, y ata el intento a la cookie del navegador', async () => {
    const jar = new Jar();
    const a = await hop(`${APP}/api/auth/google/start`, jar);
    expect(a.status).toBe(302);
    const q = new URL(a.location).searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe('atalaya-mock-client');
    expect(q.get('redirect_uri')).toBe(`${APP}/api/auth/google/callback`);
    expect(q.get('scope')).toBe('openid email');
    expect(q.get('code_challenge_method')).toBe('S256');
    for (const name of ['state', 'nonce', 'code_challenge']) expect(q.get(name), name).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const cookie = a.setCookies.find((c) => c.startsWith(`${BINDING}=`))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i); // Lax (no Strict): el regreso desde Google es una navegación entre sitios
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain=/i); // __Host- lo prohíbe

    const b = await hop(`${APP}/api/auth/google/start`); // otro intento: todo distinto, nada se reusa
    const q2 = new URL(b.location).searchParams;
    for (const name of ['state', 'nonce', 'code_challenge']) expect(q2.get(name)).not.toBe(q.get(name));
  });

  it('camino feliz: Google entra, se crea la cuenta (usuario, sin contraseña) y un segundo intento entra a la MISMA cuenta', async () => {
    const email = uniqueEmail('google-nuevo');
    const sub = `sub-${email}`;
    const first = await flow({ x_email: email, x_sub: sub });
    expect(first.done.status).toBe(302);
    expect(first.done.location).toBe('/cuenta');
    expect(first.jar.hasSession).toBe(true);
    expect(first.jar.cookies.has(BINDING)).toBe(false); // la cookie del intento se gasta
    const me = await meOf(first.jar);
    expect(me.body.email).toBe(email);
    expect(me.body.role).toEqual({ name: 'usuario', level: 0 });

    const second = await flow({ x_email: email, x_sub: sub });
    expect(second.done.location).toBe('/cuenta');
    expect((await meOf(second.jar)).body.id).toBe(me.body.id); // la misma cuenta, no una copia

    // Una cuenta que solo conoce Google no tiene contraseña: no se entra por esa puerta, y activar el 2FA
    // (que pide la contraseña) da un mensaje CLARO con la salida, no un confuso "contraseña incorrecta".
    const setup = await fetch(`${APP}/api/auth/2fa/setup`, { method: 'POST', headers: { cookie: first.jar.header(), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'cualquiera' }) });
    expect(setup.status).toBe(409);
    expect((await setup.json()).message).toContain('Crea una con');
    expect((await new Browser().post('/api/auth/login', { email, password: 'cualquier cosa larga' })).status).toBe(401);
  });

  it('un parámetro extra en el regreso (`next=https://evil…`) NO cambia el destino: nunca hay "open redirect"', async () => {
    const ok = await flow({ x_persona: 'beto' }, { callbackExtra: '&next=https://evil.example&redirect=https://evil.example&scope=email+openid&authuser=0&prompt=none' });
    expect(ok.done.location).toBe('/cuenta'); // y los parámetros propios de Google (scope, authuser…) no rompen nada
    const bad = await hop(`${APP}/api/auth/google/callback?code=x&state=y&next=https://evil.example`, new Jar());
    expect(bad.location).toBe(FAILED);
  });

  describe('login CSRF: terminar el intento de OTRA persona', () => {
    it('el regreso del atacante, en el navegador de la víctima (sin su cookie), se rechaza y no abre sesión', async () => {
      const attacker = new Jar();
      const start = await hop(`${APP}/api/auth/google/start`, attacker);
      const approved = await hop(Object.assign(new URL(start.location), {}).toString() + '&x_persona=ana');
      const victim = new Jar(); // el navegador de la víctima nunca empezó este intento
      const attempt = await hop(approved.location, victim);
      expect(attempt.location).toBe(FAILED);
      expect(victim.hasSession).toBe(false);
      // …y el intento quedó GASTADO: ni el atacante, con su cookie, puede terminarlo después.
      const retry = await hop(approved.location, attacker);
      expect(retry.location).toBe(FAILED);
      expect(attacker.hasSession).toBe(false);
    });

    it('la cookie de OTRO intento tampoco sirve', async () => {
      const own = new Jar();
      const other = new Jar();
      await hop(`${APP}/api/auth/google/start`, other); // una cookie válida, pero de otro intento
      const start = await hop(`${APP}/api/auth/google/start`, own);
      const approved = await hop(start.location + '&x_persona=ana');
      const mixed = new Jar();
      mixed.cookies.set(BINDING, other.cookies.get(BINDING)!);
      expect((await hop(approved.location, mixed)).location).toBe(FAILED);
      expect(mixed.hasSession).toBe(false);
    });
  });

  describe('state y código', () => {
    it('repetir un regreso ya usado (replay) no abre otra sesión', async () => {
      const first = await flow({ x_persona: 'ana' });
      expect(first.done.location).toBe('/cuenta');
      const replay = new Jar();
      const attempt = await hop(first.callbackUrl, replay);
      expect(attempt.location).toBe(FAILED);
      expect(replay.hasSession).toBe(false);
    });

    it('sin parámetros, con state o código inventados, o con "access_denied", siempre el mismo rechazo', async () => {
      for (const url of [
        `${APP}/api/auth/google/callback`,
        `${APP}/api/auth/google/callback?code=a&state=b`,
        `${APP}/api/auth/google/callback?code=${'a'.repeat(3000)}&state=${'A'.repeat(43)}`,
        `${APP}/api/auth/google/callback?error=access_denied&state=${'A'.repeat(43)}`,
      ]) {
        const jar = new Jar();
        expect((await hop(url, jar)).location, url.slice(0, 80)).toBe(FAILED);
        expect(jar.hasSession).toBe(false);
      }
    });

    it('un byte nulo (%00) se rechaza con 400 antes de llegar al controlador (guarda global de v0.2)', async () => {
      const jar = new Jar();
      const res = await fetch(`${APP}/api/auth/google/callback?code=a%00b&state=${'A'.repeat(43)}`, { redirect: 'manual' });
      expect(res.status).toBe(400);
      expect(jar.hasSession).toBe(false);
    });

    it('si la persona dice que NO en Google, vuelve con un error genérico', async () => {
      const denied = await flow({ x_deny: '1' });
      expect(denied.done.location).toBe(FAILED);
      expect(denied.jar.hasSession).toBe(false);
    });
  });

  describe('un id_token falsificado nunca abre sesión ni crea una cuenta', () => {
    const FAULTS = ['nonce', 'aud', 'iss', 'expired', 'future-iat', 'alg-none', 'hs256', 'bad-signature', 'unknown-kid'];
    const stamp = Date.now();
    let admin: Browser;

    beforeAll(async () => {
      admin = new Browser();
      await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'TestOnly123!' });
    });

    it.each([...FAULTS, 'unverified'])('falla "%s"', async (fault) => {
      const email = `fault-${stamp}-${fault}@example.com`;
      const x: Record<string, string> = fault === 'unverified' ? { x_email: email, x_verified: 'false' } : { x_email: email, x_fault: fault };
      const attempt = await flow(x);
      expect(attempt.done.location).toBe(FAILED);
      expect(attempt.jar.hasSession).toBe(false);
    });

    it('…y ninguna de esas diez cuentas llegó a existir (el control: una buena sí existe)', async () => {
      expect((await admin.get(`/api/admin/users?q=fault-${stamp}`)).body.total).toBe(0);
      await flow({ x_email: `fault-${stamp}-control@example.com` });
      expect((await admin.get(`/api/admin/users?q=fault-${stamp}`)).body.total).toBe(1);
    });
  });
});
