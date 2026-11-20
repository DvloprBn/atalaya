import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { isCommonPassword } from './common-passwords.js';

// Argon2id con los parámetros mínimos que recomienda OWASP (19 MiB, 2 pasadas).
// Más memoria = más caro para quien intente adivinar en masa; estos valores
// caben en un servidor pequeño. El gemelo Django lee estos mismos hashes.
const OPTIONS: argon2.HashOptions = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

// Política (NIST 800-63B): largo mínimo, sin reglas de "una mayúscula y un símbolo"
// (empujan a contraseñas predecibles). El máximo evita mandar megabytes a Argon2.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifica una contraseña. Si la cuenta no existe (hash null), verifica contra
 * un hash de relleno: tarda lo mismo, así nadie averigua por el TIEMPO de
 * respuesta qué correos tienen cuenta (lección 63, regla 2).
 */
export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  const target = hash ?? (await dummyHash);
  try {
    return (await argon2.verify(target, password)) && Boolean(hash);
  } catch {
    return false; // un hash dañado nunca abre la puerta
  }
}

/** La contraseña no puede contener la parte local del correo ("ana" en ana@x.com). */
export function passwordContainsEmail(password: string, email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return local.length >= 3 && password.toLowerCase().includes(local.toLowerCase());
}

export const PASSWORD_CONTAINS_EMAIL = 'La contraseña no puede contener tu correo';
export const PASSWORD_TOO_COMMON = 'Esa contraseña es de las más comunes y se adivina enseguida. Elige otra (una frase larga funciona bien).';

/**
 * El motivo por el que una contraseña NUEVA no se acepta, o null si sirve. Un solo sitio para las tres puertas
 * (registro, restablecer, aceptar invitación), para que ninguna se quede con una regla distinta (S-8).
 * No depende de si la cuenta existe: no revela nada del correo.
 */
export function passwordProblem(password: string, email: string): string | null {
  if (passwordContainsEmail(password, email)) return PASSWORD_CONTAINS_EMAIL;
  if (isCommonPassword(password)) return PASSWORD_TOO_COMMON;
  return null;
}
