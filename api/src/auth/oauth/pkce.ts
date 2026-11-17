import { createHash, randomBytes } from 'node:crypto';

// PKCE (RFC 7636). Evita que alguien que intercepte el `code` (en la URL de regreso) pueda
// canjearlo: el canje exige el `code_verifier` secreto, que nunca salió del servidor.
//   verifier  = 32 bytes al azar en base64url (43 caracteres)
//   challenge = base64url(SHA-256(verifier))   ← esto SÍ viaja a Google, el verifier no.

export const newVerifier = (): string => randomBytes(32).toString('base64url');

export const challengeFor = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');
