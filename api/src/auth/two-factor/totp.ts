import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP (RFC 6238) escrito a mano: son ~60 líneas y se puede leer entero. La app del
// teléfono (Google Authenticator, Authy, 1Password…) hace exactamente esto mismo.
//
//   código = HOTP(secreto, paso)          paso = segundos desde 1970 ÷ 30
//   HOTP   = HMAC-SHA1 → 4 bytes elegidos por el último nibble → módulo 10^6
//
// Los vectores oficiales del RFC están en totp.spec.ts: si algo de aquí se rompe, fallan.

export const PERIOD_S = 30;
export const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648), el que leen las apps

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text.toUpperCase().replace(/[\s=-]/g, '')) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Texto base32 inválido');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto nuevo: 20 bytes al azar (160 bits, lo que recomienda el RFC 4226) en base32. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): el código de un paso. `secret` son los bytes ya decodificados. */
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = hmac[19] & 0x0f; // "truncado dinámico": el último nibble elige dónde leer
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export const stepAt = (nowMs: number): number => Math.floor(nowMs / 1000 / PERIOD_S);

/**
 * ¿Es `code` válido ahora? Devuelve el PASO que coincidió (o null). Se aceptan el paso
 * anterior, el actual y el siguiente: el reloj del teléfono nunca está exacto.
 * El paso se devuelve para que el servicio rechace un código ya usado (anti-repetición).
 */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(nowMs);
  let matched: number | null = null;
  // Se calculan SIEMPRE los tres y se compara en tiempo constante: ni el tiempo
  // ni el orden delatan cuál estuvo cerca.
  for (const step of [current - 1, current, current + 1]) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) matched = step;
  }
  return matched;
}

/** La dirección que lee la app (el QR la contiene): otpauth://totp/Atalaya:correo?secret=… */
export function otpauthUrl(email: string, secretBase32: string): string {
  const label = encodeURIComponent(`Atalaya:${email}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=Atalaya&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_S}`;
}
