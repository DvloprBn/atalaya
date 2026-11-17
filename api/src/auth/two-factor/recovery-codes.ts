import { randomBytes } from 'node:crypto';
import { base32Encode } from './totp.js';
import { sha256 } from '../tokens.js';

// Códigos de recuperación: entran cuando no hay teléfono. Son 10, de un solo uso.
// Cada uno tiene 80 bits (16 caracteres base32): tanto azar que basta guardar su SHA-256
// (una contraseña corta necesitaría Argon2; esto no, igual que los tokens de los enlaces).

export const RECOVERY_CODE_COUNT = 10;
const FORMAT = /^[A-Z2-7]{16}$/;

/** Los 10 códigos en el formato que ve la persona: XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    (base32Encode(randomBytes(10)).match(/.{4}/g) as string[]).join('-'),
  );
}

/** Lo que escribe la persona (con guiones, espacios o minúsculas) → la forma canónica, o null. */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  return FORMAT.test(compact) ? compact : null;
}

export const hashRecoveryCode = (canonical: string): string => sha256(canonical);
