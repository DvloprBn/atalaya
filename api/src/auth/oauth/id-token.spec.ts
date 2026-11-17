import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import { type Jwk, verifyIdToken } from './id-token.js';
import type { OAuthErrorCode } from './oauth-error.js';

const NOW_MS = 1_790_000_000_000;
const NOW_S = NOW_MS / 1000;
const EXPECT = { issuers: ['https://idp.example'], audience: 'mi-client-id', nonce: 'nonce-del-intento', nowMs: NOW_MS };

const b64 = (value: object | Buffer) => Buffer.from(Buffer.isBuffer(value) ? value : JSON.stringify(value)).toString('base64url');
const keyPair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const good = keyPair();
const jwkOf = (pair: ReturnType<typeof keyPair>, extra: Partial<Jwk> = {}): Jwk => ({
  ...(pair.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'k1', use: 'sig', alg: 'RS256', ...extra,
});
const KEYS = [jwkOf(good)];

const baseClaims = () => ({
  iss: 'https://idp.example', aud: 'mi-client-id', sub: 'sub-123', email: 'Ana@Example.com', email_verified: true,
  nonce: 'nonce-del-intento', iat: NOW_S - 10, exp: NOW_S + 3000,
});

/** Firma un token como lo haría el proveedor (o como lo falsificaría un atacante). */
function sign(claims: object, opts: { header?: object; pair?: ReturnType<typeof keyPair> } = {}): string {
  const header = b64({ alg: 'RS256', typ: 'JWT', kid: 'k1', ...opts.header });
  const payload = b64(claims);
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign((opts.pair ?? good).privateKey);
  return `${header}.${payload}.${b64(signature)}`;
}

const reject = (token: string, code: OAuthErrorCode, keys = KEYS) =>
  expect(() => verifyIdToken(token, keys, EXPECT)).toThrow(expect.objectContaining({ code }));

describe('verifyIdToken', () => {
  it('acepta un token legítimo y devuelve el sub y el correo en minúsculas', () => {
    expect(verifyIdToken(sign(baseClaims()), KEYS, EXPECT)).toEqual({ sub: 'sub-123', email: 'ana@example.com' });
  });

  describe('algoritmo y llave', () => {
    it('rechaza "alg: none" (token sin firma)', () => {
      const token = `${b64({ alg: 'none', typ: 'JWT', kid: 'k1' })}.${b64(baseClaims())}.`;
      reject(token, 'token_alg');
    });

    it('rechaza la confusión HS256: firmado con la llave PÚBLICA como si fuera una contraseña', () => {
      const publicPem = good.publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const header = b64({ alg: 'HS256', typ: 'JWT', kid: 'k1' });
      const payload = b64(baseClaims());
      const mac = createHmac('sha256', publicPem).update(`${header}.${payload}`).digest();
      reject(`${header}.${payload}.${b64(mac)}`, 'token_alg');
    });

    it('rechaza otros algoritmos aunque sean RSA (RS512)', () => {
      reject(sign(baseClaims(), { header: { alg: 'RS512' } }), 'token_alg');
    });

    it('rechaza un token sin kid o con un kid que el proveedor no publica', () => {
      reject(sign(baseClaims(), { header: { kid: undefined } }), 'token_kid');
      reject(sign(baseClaims(), { header: { kid: 'desconocida' } }), 'token_kid');
    });

    it('rechaza una llave que no sirve para firmar, o demasiado débil (RSA de 1024 bits)', () => {
      reject(sign(baseClaims()), 'token_key', [jwkOf(good, { use: 'enc' })]);
      const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
      reject(sign(baseClaims(), { pair: weak }), 'token_key', [jwkOf(weak)]);
    });
  });

  describe('firma', () => {
    it('rechaza una firma de otra llave (alguien que no es el proveedor)', () => {
      reject(sign(baseClaims(), { pair: keyPair() }), 'token_signature');
    });

    it('rechaza una carga alterada después de firmar (por ejemplo, cambiar el correo)', () => {
      const [h, , s] = sign(baseClaims()).split('.');
      reject(`${h}.${b64({ ...baseClaims(), email: 'victima@example.com' })}.${s}`, 'token_signature');
    });
  });

  describe('a quién va dirigido y de quién viene', () => {
    it('rechaza un emisor que no es el esperado', () => {
      reject(sign({ ...baseClaims(), iss: 'https://evil.example' }), 'token_issuer');
    });

    it('rechaza una audiencia ajena: un token emitido para OTRA aplicación', () => {
      reject(sign({ ...baseClaims(), aud: 'otra-aplicacion' }), 'token_audience');
      reject(sign({ ...baseClaims(), aud: undefined }), 'token_audience');
    });

    it('con varias audiencias exige que `azp` sea la nuestra (regla de OIDC)', () => {
      reject(sign({ ...baseClaims(), aud: ['mi-client-id', 'otra'] }), 'token_audience');
      expect(verifyIdToken(sign({ ...baseClaims(), aud: ['mi-client-id', 'otra'], azp: 'mi-client-id' }), KEYS, EXPECT).sub).toBe('sub-123');
    });
  });

  describe('vigencia y repetición', () => {
    it('rechaza un token vencido, pero tolera 60 s de diferencia de reloj', () => {
      reject(sign({ ...baseClaims(), exp: NOW_S - 61 }), 'token_expired');
      expect(verifyIdToken(sign({ ...baseClaims(), exp: NOW_S - 30 }), KEYS, EXPECT).sub).toBe('sub-123');
      reject(sign({ ...baseClaims(), exp: undefined }), 'token_expired');
    });

    it('rechaza un token "emitido en el futuro"', () => {
      reject(sign({ ...baseClaims(), iat: NOW_S + 61 }), 'token_iat');
    });

    it('rechaza un nonce que no es el de ESTE intento (token de otro intento o repetido)', () => {
      reject(sign({ ...baseClaims(), nonce: 'de-otro-intento' }), 'token_nonce');
      reject(sign({ ...baseClaims(), nonce: undefined }), 'token_nonce');
      reject(sign({ ...baseClaims(), nonce: 'nonce-del-intentoX' }), 'token_nonce'); // distinto largo
    });
  });

  describe('identidad', () => {
    it('rechaza un correo sin verificar por el proveedor (false, ausente o el TEXTO "true")', () => {
      reject(sign({ ...baseClaims(), email_verified: false }), 'email_unverified');
      reject(sign({ ...baseClaims(), email_verified: undefined }), 'email_unverified');
      reject(sign({ ...baseClaims(), email_verified: 'true' }), 'email_unverified');
    });

    it('rechaza un sub vacío o enorme y un correo que no es un correo', () => {
      reject(sign({ ...baseClaims(), sub: '' }), 'token_subject');
      reject(sign({ ...baseClaims(), sub: 'x'.repeat(256) }), 'token_subject');
      for (const email of ['', 'sin-arroba', 'a@b', 'a b@c.com', '<script>@x.com', `${'x'.repeat(250)}@a.com`]) {
        reject(sign({ ...baseClaims(), email }), 'token_email');
      }
    });
  });

  describe('forma', () => {
    it('rechaza lo que no es un JWT', () => {
      for (const junk of ['', 'a.b', 'a.b.c.d', 'esto no es un token', 'a.b.***', `${'a'.repeat(9000)}.b.c`]) {
        reject(junk, 'token_malformed');
      }
      reject(`${b64(Buffer.from('no es json'))}.${b64({})}.firma`, 'token_malformed');
    });
  });
});
