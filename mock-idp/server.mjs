// SERVIDOR OAUTH/OPENID FALSO — SOLO PARA DESARROLLO Y PRUEBAS. Nunca va a producción.
//
// Hace el papel de Google: pantalla de "elegir cuenta", canje de código por id_token firmado con
// RSA y publicación de sus llaves (JWKS). Así Atalaya prueba el flujo completo sin cuenta de Google.
//
// Y puede MENTIR a propósito: con `x_fault=…` firma un id_token defectuoso (nonce ajeno, audiencia
// ajena, vencido, sin firma…) para comprobar que Atalaya los rechaza todos. Esos parámetros `x_*`
// no existen en el Google real; son la palanca de las pruebas de ataque.
import { createHash, createHmac, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ID = process.env.MOCK_CLIENT_ID;
const CLIENT_SECRET = process.env.MOCK_CLIENT_SECRET;
const REDIRECT_URI = process.env.MOCK_REDIRECT_URI;
const ISSUER = process.env.MOCK_ISSUER;
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !ISSUER) throw new Error('Faltan MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_REDIRECT_URI o MOCK_ISSUER');

const b64 = (value) => Buffer.from(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).toString('base64url');
const GOOD = generateKeyPairSync('rsa', { modulusLength: 2048 }); // la llave "de Google"
const EVIL = generateKeyPairSync('rsa', { modulusLength: 2048 }); // la de un impostor (fallo bad-signature)
const JWK = { ...GOOD.publicKey.export({ format: 'jwk' }), kid: 'mock-1', use: 'sig', alg: 'RS256' };

const PERSONAS = {
  ana: { sub: 'mock-ana', email: 'ana.google@example.com', verified: true },
  beto: { sub: 'mock-beto', email: 'beto.google@example.com', verified: true },
  'sin-verificar': { sub: 'mock-sin-verificar', email: 'sinverificar.google@example.com', verified: false },
};
const codes = new Map(); // código → lo que se firmará al canjearlo (de un solo uso)

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const send = (res, status, body, type = 'application/json') => res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(typeof body === 'string' ? body : JSON.stringify(body));

function idToken(entry) {
  const now = Math.floor(Date.now() / 1000);
  const fault = entry.fault;
  const claims = {
    iss: fault === 'iss' ? 'https://evil.example' : ISSUER, aud: fault === 'aud' ? 'otra-aplicacion' : CLIENT_ID,
    sub: entry.sub, email: entry.email, email_verified: entry.verified, nonce: fault === 'nonce' ? 'nonce-de-otro-intento' : entry.nonce,
    iat: fault === 'expired' ? now - 7200 : fault === 'future-iat' ? now + 3600 : now,
    exp: fault === 'expired' ? now - 3600 : now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT', kid: fault === 'unknown-kid' ? 'desconocida' : 'mock-1' };
  if (fault === 'alg-none') return `${b64({ ...header, alg: 'none' })}.${b64(claims)}.`;
  if (fault === 'hs256') { // confusión de algoritmo: firmado con la llave PÚBLICA como si fuera una contraseña
    const h = b64({ ...header, alg: 'HS256' }); const p = b64(claims);
    return `${h}.${p}.${b64(createHmac('sha256', GOOD.publicKey.export({ type: 'spki', format: 'pem' })).update(`${h}.${p}`).digest())}`;
  }
  const h = b64(header); const p = b64(claims);
  const key = fault === 'bad-signature' ? EVIL.privateKey : GOOD.privateKey;
  return `${h}.${p}.${b64(createSign('RSA-SHA256').update(`${h}.${p}`).sign(key))}`;
}

function authorize(url, res) {
  const q = url.searchParams;
  if (q.get('client_id') !== CLIENT_ID || q.get('redirect_uri') !== REDIRECT_URI) return send(res, 400, 'client_id o redirect_uri no coinciden', 'text/plain');
  if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('state') || !q.get('nonce')) {
    return send(res, 400, 'Faltan response_type=code, PKCE S256, state o nonce', 'text/plain');
  }
  const back = (params) => res.writeHead(302, { location: `${REDIRECT_URI}?${new URLSearchParams({ ...params, state: q.get('state') })}` }).end();
  if (q.get('x_deny')) return back({ error: 'access_denied' }); // la persona dijo "no" en Google
  const persona = PERSONAS[q.get('x_persona')];
  if (!persona && !q.get('x_email')) { // sin cuenta elegida: la pantalla de "elegir cuenta"
    const links = Object.entries(PERSONAS).map(([name, p]) => {
      const next = new URLSearchParams(q); next.set('x_persona', name);
      return `<li><a href="/authorize?${esc(next)}">${esc(p.email)}${p.verified ? '' : ' (correo sin verificar)'}</a></li>`;
    }).join('');
    return send(res, 200, `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Servidor OAuth de prueba</title></head><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1>Servidor OAuth de prueba</h1><p>Esto hace de «Iniciar sesión con Google». No es Google: elige una cuenta de prueba.</p><ul>${links}</ul></body></html>`, 'text/html');
  }
  const code = randomBytes(24).toString('base64url');
  codes.set(code, {
    sub: q.get('x_sub') ?? persona?.sub ?? `mock-${createHash('sha256').update(q.get('x_email')).digest('hex').slice(0, 12)}`,
    email: q.get('x_email') ?? persona.email, verified: q.get('x_verified') ? q.get('x_verified') === 'true' : (persona?.verified ?? true),
    nonce: q.get('nonce'), challenge: q.get('code_challenge'), fault: q.get('x_fault'), expires: Date.now() + 60_000,
  });
  back({ code });
}

function token(body, res) {
  const f = new URLSearchParams(body);
  const entry = codes.get(f.get('code'));
  codes.delete(f.get('code')); // un código se canjea UNA vez, salga bien o mal
  const bad = (error) => send(res, 400, { error });
  if (f.get('client_id') !== CLIENT_ID || f.get('client_secret') !== CLIENT_SECRET) return send(res, 401, { error: 'invalid_client' });
  if (f.get('grant_type') !== 'authorization_code' || f.get('redirect_uri') !== REDIRECT_URI) return bad('invalid_request');
  if (!entry || entry.expires < Date.now()) return bad('invalid_grant');
  // PKCE: quien canjea debe conocer el verifier cuyo SHA-256 se anunció al empezar.
  const verifier = f.get('code_verifier') ?? '';
  if (createHash('sha256').update(verifier).digest('base64url') !== entry.challenge) return bad('invalid_grant');
  send(res, 200, { access_token: randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 3600, id_token: idToken(entry) });
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://mock');
  let body = '';
  req.on('data', (c) => { if ((body += c).length > 8192) req.destroy(); });
  req.on('end', () => {
    if (req.method === 'GET' && url.pathname === '/authorize') return authorize(url, res);
    if (req.method === 'POST' && url.pathname === '/token') return token(body, res);
    if (req.method === 'GET' && url.pathname === '/jwks') return send(res, 200, { keys: [JWK] });
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    send(res, 404, { error: 'not_found' });
  });
}).listen(PORT, '0.0.0.0', () => console.log(`Servidor OAuth de PRUEBA escuchando en ${PORT}`));
