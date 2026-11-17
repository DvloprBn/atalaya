import { base32Decode, base32Encode, hotp, newSecret, otpauthUrl, stepAt, verifyTotp } from './totp.js';

// Vectores OFICIALES del RFC 6238 (Apéndice B, SHA-1). El secreto es el texto ASCII
// "12345678901234567890"; el RFC da códigos de 8 dígitos y la app usa 6 (sus últimos 6).
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(RFC_VECTORS)('a las %i s el RFC dice %s', (seconds, expected) => {
    expect(hotp(RFC_SECRET, stepAt(seconds * 1000), 8)).toBe(expected);
    expect(hotp(RFC_SECRET, stepAt(seconds * 1000), 6)).toBe(expected.slice(2)); // 6 dígitos = los últimos 6
  });

  it('base32 va y viene sin perder un byte (el RFC 4648 da su propio vector)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Encode(RFC_SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('acepta el código del paso anterior, del actual y del siguiente, y devuelve el paso', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1111111109 * 1000; // paso 37037036
    const at = (step: number) => hotp(RFC_SECRET, step);
    expect(verifyTotp(secret, at(37037036), now)).toBe(37037036);
    expect(verifyTotp(secret, at(37037035), now)).toBe(37037035);
    expect(verifyTotp(secret, at(37037037), now)).toBe(37037037);
  });

  it('rechaza dos pasos de diferencia, formatos raros y un código de otro secreto', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1111111109 * 1000;
    expect(verifyTotp(secret, hotp(RFC_SECRET, 37037034), now)).toBeNull();
    expect(verifyTotp(secret, hotp(RFC_SECRET, 37037038), now)).toBeNull();
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 345', '０８１８０４']) {
      expect(verifyTotp(secret, bad, now)).toBeNull();
    }
    expect(verifyTotp(newSecret(), hotp(RFC_SECRET, 37037036), now)).toBeNull();
  });

  it('la URL de la app lleva el correo codificado y el emisor', () => {
    const url = otpauthUrl('ana+x@example.com', 'ABC234');
    expect(url).toBe(
      'otpauth://totp/Atalaya%3Aana%2Bx%40example.com?secret=ABC234&issuer=Atalaya&algorithm=SHA1&digits=6&period=30',
    );
  });
});
