import { hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';

describe('códigos de recuperación', () => {
  it('son 10, distintos, con el formato XXXX-XXXX-XXXX-XXXX', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
  });

  it('se aceptan con guiones, sin ellos, con espacios o en minúsculas', () => {
    const [code] = newRecoveryCodes();
    const canonical = code.replaceAll('-', '');
    expect(normalizeRecoveryCode(code)).toBe(canonical);
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(canonical);
    expect(normalizeRecoveryCode(code.replaceAll('-', ' '))).toBe(canonical);
  });

  it('rechaza lo que no tiene la forma (y un código TOTP de 6 dígitos no se confunde)', () => {
    for (const bad of ['', '123456', 'ABCD-EFGH', 'ABCD-EFGH-IJKL-MNO1', 'ABCD-EFGH-IJKL-MNOPQ']) {
      expect(normalizeRecoveryCode(bad)).toBeNull();
    }
  });

  it('el hash es SHA-256 hexadecimal y estable', () => {
    expect(hashRecoveryCode('ABCDEFGHIJKLMNOP')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('ABCDEFGHIJKLMNOP')).toBe(hashRecoveryCode('ABCDEFGHIJKLMNOP'));
  });
});
