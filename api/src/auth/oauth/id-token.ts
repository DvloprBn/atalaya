import { createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';
import { OAuthError } from './oauth-error.js';

// Verificación de un id_token (OpenID Connect) escrita a mano: un JWT con tres partes
//   cabecera.carga.firma   (cada una en base64url)
// Lo que dice la carga solo se cree DESPUÉS de comprobar la firma con la llave pública del
// proveedor, y se revisan siete cosas: algoritmo, llave, emisor, audiencia, vigencia, nonce y correo.

export interface Jwk { kty?: string; kid?: string; use?: string; alg?: string; n?: string; e?: string }
export interface IdTokenClaims { sub: string; email: string }
export interface Expectations { issuers: string[]; audience: string; nonce: string; nowMs?: number }

const MAX_TOKEN_CHARS = 8192;
const SKEW_S = 60; // tolerancia de reloj entre el proveedor y este servidor
const MIN_MODULUS_BYTES = 256; // RSA de 2048 bits o más

const json = (part: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    /* se cae abajo */
  }
  throw new OAuthError('token_malformed');
};

/** Compara dos textos en tiempo constante (sin delatar con el tiempo en qué letra difieren). */
function sameText(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyIdToken(token: string, keys: Jwk[], expected: Expectations): IdTokenClaims {
  if (token.length > MAX_TOKEN_CHARS) throw new OAuthError('token_malformed');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p))) throw new OAuthError('token_malformed');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = json(headerPart);

  // 1. Algoritmo FIJO. Un token que diga "none" (sin firma) o "HS256" (firmado con la llave pública
  //    como si fuera una contraseña: el ataque clásico de confusión) se descarta antes de mirar nada más.
  if (header.alg !== 'RS256') throw new OAuthError('token_alg');

  // 2. La llave sale del conjunto del proveedor, por `kid`; nunca de lo que traiga el token.
  if (typeof header.kid !== 'string') throw new OAuthError('token_kid');
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new OAuthError('token_kid');
  if (jwk.kty !== 'RSA' || (jwk.use !== undefined && jwk.use !== 'sig') || (jwk.alg !== undefined && jwk.alg !== 'RS256')) {
    throw new OAuthError('token_key');
  }
  if (typeof jwk.n !== 'string' || Buffer.from(jwk.n, 'base64url').length < MIN_MODULUS_BYTES) throw new OAuthError('token_key');

  // 3. Firma (RSASSA-PKCS1-v1_5 con SHA-256) sobre "cabecera.carga" tal como llegó.
  let valid = false;
  try {
    const publicKey = createPublicKey({ key: jwk as import('node:crypto').JsonWebKey, format: 'jwk' });
    valid = createVerify('RSA-SHA256').update(`${headerPart}.${payloadPart}`).verify(publicKey, Buffer.from(signaturePart, 'base64url'));
  } catch {
    throw new OAuthError('token_key');
  }
  if (!valid) throw new OAuthError('token_signature');

  // Desde aquí la carga es auténtica. Falta comprobar que sea PARA nosotros y VIGENTE.
  const claims = json(payloadPart);
  const nowS = Math.floor((expected.nowMs ?? Date.now()) / 1000);

  if (typeof claims.iss !== 'string' || !expected.issuers.includes(claims.iss)) throw new OAuthError('token_issuer');

  // La audiencia es NUESTRO client_id: un token emitido para otra aplicación no vale aquí.
  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(expected.audience)) throw new OAuthError('token_audience');
  if (audiences.length > 1 && claims.azp !== expected.audience) throw new OAuthError('token_audience'); // regla de OIDC

  if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < nowS) throw new OAuthError('token_expired');
  if (typeof claims.iat !== 'number' || claims.iat - SKEW_S > nowS) throw new OAuthError('token_iat');

  // El nonce ata ESTE token a ESTE intento: un token de otro intento (robado o repetido) no sirve.
  if (!sameText(claims.nonce, expected.nonce)) throw new OAuthError('token_nonce');

  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 255) throw new OAuthError('token_subject');
  const email = claims.email;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) {
    throw new OAuthError('token_email');
  }
  // Sin correo VERIFICADO por el proveedor no se vincula ni se crea nada: cualquiera podría
  // declarar en su cuenta el correo de otra persona.
  if (claims.email_verified !== true) throw new OAuthError('email_unverified');

  return { sub: claims.sub, email: email.trim().toLowerCase() };
}
