import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box.js';
import { newSecret } from './totp.js';

const box = new SecretBox(randomBytes(32));
// Un secreto distinto en cada corrida: sin literales con forma de clave en el repo (y gitleaks calla sin excepciones).
const SECRET = newSecret();

describe('SecretBox', () => {
  it('descifra lo que cifró y no deja el secreto a la vista', () => {
    const stored = box.encrypt(SECRET, 'user-1');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(box.decrypt(stored, 'user-1')).toBe(SECRET);
  });

  it('el mismo secreto cifrado dos veces da textos distintos (iv nuevo cada vez)', () => {
    expect(box.encrypt(SECRET, 'user-1')).not.toBe(box.encrypt(SECRET, 'user-1'));
  });

  it('un secreto copiado a la fila de otro usuario no descifra', () => {
    expect(() => box.decrypt(box.encrypt(SECRET, 'user-1'), 'user-2')).toThrow();
  });

  it('un byte alterado se detecta, y otra llave tampoco abre', () => {
    const [v, iv, tag, data] = box.encrypt(SECRET, 'user-1').split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() => box.decrypt([v, iv, tag, flipped.toString('base64url')].join('.'), 'user-1')).toThrow();
    expect(() => new SecretBox(randomBytes(32)).decrypt(box.encrypt(SECRET, 'user-1'), 'user-1')).toThrow();
  });

  it('exige una llave de 32 bytes y un formato conocido', () => {
    expect(() => new SecretBox(randomBytes(16))).toThrow('32 bytes');
    expect(() => box.decrypt('v9.a.b.c', 'user-1')).toThrow('formato');
  });
});
