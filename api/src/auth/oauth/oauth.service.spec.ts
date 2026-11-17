import { OAuthError } from './oauth-error.js';
import { challengeFor } from './pkce.js';

for (const [name, value] of Object.entries({
  DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x', JWT_SECRET: 'x'.repeat(32), APP_ORIGIN: 'http://localhost:3070',
  SMTP_URL: 'smtp://x:1025', MAIL_FROM: 'x@example.com', TOTP_ENCRYPTION_KEY: 'ab'.repeat(32),
  OAUTH_CLIENT_ID: 'mi-client-id', OAUTH_CLIENT_SECRET: 'mi-secreto', OAUTH_ISSUER: 'https://idp.example',
  OAUTH_AUTH_URL: 'https://idp.example/authorize', OAUTH_TOKEN_URL: 'https://idp.example/token', OAUTH_JWKS_URL: 'https://idp.example/jwks',
})) vi.stubEnv(name, value);

// Se sustituyen las dos piezas que salen a la red o a la criptografía: aquí se prueba el ORDEN y los datos que se pasan.
vi.mock('./http-json.js', () => ({ postForm: vi.fn(), getJson: vi.fn() }));
vi.mock('./id-token.js', () => ({ verifyIdToken: vi.fn() }));
const { postForm } = await import('./http-json.js');
const { verifyIdToken } = await import('./id-token.js');
const { OAuthService } = await import('./oauth.service.js');

const ATTEMPT = { state: 'S'.repeat(43), nonce: 'N'.repeat(43), verifier: 'V'.repeat(43), binding: 'B'.repeat(43) };
const CLAIMS = { sub: 'sub-1', email: 'ana@example.com' };

function build(opts: { twoFactor?: boolean } = {}) {
  const states = { create: vi.fn().mockResolvedValue(ATTEMPT), consume: vi.fn().mockResolvedValue({ nonce: ATTEMPT.nonce, verifier: ATTEMPT.verifier }) };
  const jwks = { get: vi.fn().mockResolvedValue(['llave-vieja']), refresh: vi.fn().mockResolvedValue(['llave-nueva']) };
  const accounts = { resolve: vi.fn().mockResolvedValue({ userId: 'u1', outcome: 'login' }) };
  const sessions = { start: vi.fn().mockResolvedValue({ access: 'a' }) };
  const second = { isEnabled: vi.fn().mockResolvedValue(opts.twoFactor ?? false), startChallenge: vi.fn().mockResolvedValue('reto') };
  const service = new OAuthService(states as never, jwks as never, accounts as never, sessions as never, second as never);
  vi.mocked(postForm).mockResolvedValue({ id_token: 'el.id.token' });
  vi.mocked(verifyIdToken).mockReturnValue(CLAIMS);
  return { service, states, jwks, accounts, sessions, second };
}
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

beforeEach(() => vi.clearAllMocks());

describe('OAuthService.start', () => {
  it('arma la URL de Google con PKCE S256 (el challenge sale del verifier), state, nonce y redirect_uri exacto', async () => {
    const { service } = build();
    const { url, binding } = await service.start();
    const q = new URL(url).searchParams;
    expect(url.startsWith('https://idp.example/authorize?')).toBe(true);
    expect(Object.fromEntries(q)).toEqual({
      response_type: 'code', client_id: 'mi-client-id', redirect_uri: 'http://localhost:3070/api/auth/google/callback',
      scope: 'openid email', state: ATTEMPT.state, nonce: ATTEMPT.nonce,
      code_challenge: challengeFor(ATTEMPT.verifier), code_challenge_method: 'S256',
    });
    expect(url).not.toContain(ATTEMPT.verifier); // el verifier NUNCA sale hacia Google en esta etapa
    expect(binding).toBe(ATTEMPT.binding);
  });
});

describe('OAuthService.callback', () => {
  const query = { code: 'el-codigo', state: ATTEMPT.state };

  it('si la persona dijo que no, o falta code/state, se rechaza sin tocar nada', async () => {
    const { service, states } = build();
    expect(await code(service.callback({ error: 'access_denied', state: 'x' }, 'b'))).toBe('denied');
    for (const q of [{}, { code: 'x' }, { state: 'x' }, { code: '', state: 'x' }, { code: 'a'.repeat(2049), state: 'x' }, { code: 7, state: 'x' }]) {
      expect(await code(service.callback(q, 'b')), JSON.stringify(q).slice(0, 30)).toBe('bad_request');
    }
    expect(states.consume).not.toHaveBeenCalled();
  });

  it('PRIMERO se gasta el intento (state + cookie); si eso falla, NO se llama a Google', async () => {
    const { service, states } = build();
    states.consume.mockRejectedValue(new OAuthError('binding_mismatch'));
    expect(await code(service.callback(query, 'cookie-ajena'))).toBe('binding_mismatch');
    expect(postForm).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('el canje manda el verifier guardado, el redirect_uri y las credenciales del cliente', async () => {
    const { service, states } = build();
    await service.callback(query, 'la-cookie');
    expect(states.consume).toHaveBeenCalledWith(ATTEMPT.state, 'la-cookie');
    expect(postForm).toHaveBeenCalledWith('https://idp.example/token', {
      grant_type: 'authorization_code', code: 'el-codigo', redirect_uri: 'http://localhost:3070/api/auth/google/callback',
      client_id: 'mi-client-id', client_secret: 'mi-secreto', code_verifier: ATTEMPT.verifier,
    });
  });

  it('el id_token se valida con el NONCE guardado en el servidor (no uno que venga en la petición) y nuestra audiencia', async () => {
    const { service } = build();
    await service.callback({ ...query, nonce: 'uno-que-manda-el-atacante' } as typeof query, 'c'); // campo extra: el servidor lo ignora
    expect(verifyIdToken).toHaveBeenCalledWith('el.id.token', ['llave-vieja'], {
      issuers: ['https://idp.example'], audience: 'mi-client-id', nonce: ATTEMPT.nonce,
    });
  });

  it('una respuesta del proveedor sin id_token (o con otro tipo) se rechaza', async () => {
    for (const body of [{}, { id_token: 5 }, null, 'texto']) {
      const { service } = build();
      vi.mocked(postForm).mockResolvedValue(body);
      expect(await code(service.callback(query, 'c'))).toBe('bad_token_response');
    }
  });

  it('sin 2FA abre sesión; con 2FA da un RETO y no abre sesión', async () => {
    const plain = build();
    expect(await plain.service.callback(query, 'c')).toEqual({ kind: 'session', tokens: { access: 'a' } });
    const twoFactor = build({ twoFactor: true });
    expect(await twoFactor.service.callback(query, 'c')).toEqual({ kind: 'challenge', challenge: 'reto' });
    expect(twoFactor.sessions.start).not.toHaveBeenCalled();
  });

  it('con una llave desconocida o una firma que no verifica, vuelve a pedir las llaves UNA vez y reintenta', async () => {
    const { service, jwks } = build();
    vi.mocked(verifyIdToken).mockImplementationOnce(() => { throw new OAuthError('token_kid'); }).mockReturnValueOnce(CLAIMS);
    expect((await service.callback(query, 'c')).kind).toBe('session');
    expect(jwks.refresh).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyIdToken).mock.calls[1][1]).toEqual(['llave-nueva']);
  });

  it('si tras renovar las llaves sigue sin verificar, se rechaza (sin bucles)', async () => {
    const { service, jwks } = build();
    vi.mocked(verifyIdToken).mockImplementation(() => { throw new OAuthError('token_signature'); });
    expect(await code(service.callback(query, 'c'))).toBe('token_signature');
    expect(jwks.refresh).toHaveBeenCalledTimes(1);
  });

  it('un token vencido, de otra audiencia o con otro nonce NO provoca descargar llaves', async () => {
    for (const reason of ['token_expired', 'token_audience', 'token_nonce', 'email_unverified'] as const) {
      const { service, jwks } = build();
      vi.mocked(verifyIdToken).mockImplementation(() => { throw new OAuthError(reason); });
      expect(await code(service.callback(query, 'c'))).toBe(reason);
      expect(jwks.refresh).not.toHaveBeenCalled();
    }
  });

  it('un rechazo de la cuenta (desactivada, etc.) no abre sesión ni crea reto', async () => {
    const { service, accounts, sessions, second } = build();
    accounts.resolve.mockRejectedValue(new OAuthError('account_denied'));
    expect(await code(service.callback(query, 'c'))).toBe('account_denied');
    expect(sessions.start).not.toHaveBeenCalled();
    expect(second.startChallenge).not.toHaveBeenCalled();
  });
});
