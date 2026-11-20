import { createCipheriv, randomBytes } from 'node:crypto';
import { SecretBox, keyId } from './secret-box.js';
import { newSecret } from './totp.js';

const box = new SecretBox(randomBytes(32));
// Un secreto distinto en cada corrida: sin literales con forma de clave en el repo (y gitleaks calla sin excepciones).
const SECRET = newSecret();

describe('SecretBox', () => {
  it('descifra lo que cifró y no deja el secreto a la vista', () => {
    const stored = box.encrypt(SECRET, 'user-1');
    expect(stored.startsWith(`v2.${box.kid}.`)).toBe(true);
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
    const [v, kid, iv, tag, data] = box.encrypt(SECRET, 'user-1').split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 1;
    expect(() => box.decrypt([v, kid, iv, tag, flipped.toString('base64url')].join('.'), 'user-1')).toThrow();
    expect(() => new SecretBox(randomBytes(32)).decrypt(box.encrypt(SECRET, 'user-1'), 'user-1')).toThrow();
  });

  it('exige una llave de 32 bytes y un formato conocido', () => {
    expect(() => new SecretBox(randomBytes(16))).toThrow('32 bytes');
    expect(() => box.decrypt('v9.a.b.c', 'user-1')).toThrow('formato');
  });
});

/** Cifra como lo hacía la versión ANTERIOR a v1.0 (formato v1, sin kid): para probar que esas filas se siguen leyendo. */
function legacyV1(key: Buffer, plain: string, userId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(userId));
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

describe('SecretBox · llavero y rotación (S-9)', () => {
  const oldKey = randomBytes(32);
  const newKey = randomBytes(32);

  it('el kid identifica la llave sin revelarla: 8 caracteres, estable, distinto entre llaves', () => {
    expect(keyId(oldKey)).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(keyId(oldKey)).toBe(keyId(Buffer.from(oldKey)));
    expect(keyId(oldKey)).not.toBe(keyId(newKey));
    expect(oldKey.toString('base64url')).not.toContain(keyId(oldKey));
  });

  it('durante la rotación se lee lo cifrado con la vieja (v2 y v1) y todo lo nuevo sale con la nueva', () => {
    const before = new SecretBox(oldKey);
    const v2old = before.encrypt(SECRET, 'user-1');
    const v1old = legacyV1(oldKey, SECRET, 'user-1');

    const during = new SecretBox(newKey, [oldKey]);
    expect(during.decrypt(v2old, 'user-1')).toBe(SECRET);
    expect(during.decrypt(v1old, 'user-1')).toBe(SECRET);
    expect(during.encrypt(SECRET, 'user-1').startsWith(`v2.${keyId(newKey)}.`)).toBe(true);
    expect(during.needsRotation(v2old)).toBe(true);
    expect(during.needsRotation(v1old)).toBe(true);
    expect(during.needsRotation(during.encrypt(SECRET, 'user-1'))).toBe(false);
  });

  it('al retirar la llave vieja, lo que no se re-cifró ya no abre (por eso existe --check)', () => {
    const v2old = new SecretBox(oldKey).encrypt(SECRET, 'user-1');
    expect(() => new SecretBox(newKey).decrypt(v2old, 'user-1')).toThrow('no está en el llavero');
    expect(() => new SecretBox(newKey).decrypt(legacyV1(oldKey, SECRET, 'user-1'), 'user-1')).toThrow('Ninguna llave');
  });

  it('el kid no se puede falsificar para forzar otra llave: un kid cambiado no abre', () => {
    const during = new SecretBox(newKey, [oldKey]);
    const parts = during.encrypt(SECRET, 'user-1').split('.');
    parts[1] = keyId(oldKey); // apunta a la llave vieja, pero el texto se cifró con la nueva: GCM falla
    expect(() => during.decrypt(parts.join('.'), 'user-1')).toThrow();
  });

  it('rechaza una llave repetida en el llavero (la actual entre las viejas, o una vieja dos veces)', () => {
    expect(() => new SecretBox(newKey, [newKey])).toThrow('repetida');
    expect(() => new SecretBox(newKey, [oldKey, Buffer.from(oldKey)])).toThrow('repetida');
    expect(() => new SecretBox(newKey, [randomBytes(16)])).toThrow('32 bytes');
  });
});

