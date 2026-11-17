import { createHash, randomBytes } from 'node:crypto';

/**
 * Token opaco para enlaces de correo y refresh: 32 bytes aleatorios (256 bits)
 * en base64url = 43 caracteres. Imposible de adivinar; no lleva datos dentro.
 */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Forma exacta de un token opaco: se valida antes de tocar la base. */
export const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * La base guarda el SHA-256 del token, nunca el token. Si alguien roba un
 * respaldo de la base, los enlaces y sesiones que ahí aparecen no le sirven.
 * (Basta SHA-256 y no Argon2: el token ya tiene 256 bits de azar.)
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
