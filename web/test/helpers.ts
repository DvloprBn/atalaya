// Herramientas comunes de las pruebas en Chrome.
import { createHmac } from 'node:crypto';

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:3071';

/** El enlace (con token) del correo más reciente para `to` con ese asunto. Espera hasta 30 s. */
export async function mailLink(to: string, subject: string): Promise<string> {
  const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
  for (let i = 0; i < 30; i++) {
    const found = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)).json();
    if (found.messages?.[0]) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${found.messages[0].ID}`)).json();
      return /https?:\/\/\S+token=[A-Za-z0-9_-]{43}/.exec(message.Text)![0];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No llegó "${subject}" a ${to}`);
}

/**
 * El código TOTP (RFC 6238) de un secreto base32, calculado AQUÍ y no con el código del servidor:
 * si el servidor tuviera un error, esta prueba lo vería en vez de repetirlo.
 * `stepOffset`: 0 = el paso actual, 1 = el siguiente.
 */
export function totp(secretBase32: string, stepOffset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secretBase32) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + stepOffset));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[19] & 15;
  const value = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}
