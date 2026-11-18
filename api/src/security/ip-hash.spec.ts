import { clip, hashIp } from './ip-hash.js';

describe('hashIp', () => {
  it('es estable con la misma llave y distinto con otra (sin la llave no se compara con IP conocidas)', () => {
    expect(hashIp('203.0.113.9', 'k'.repeat(32))).toBe(hashIp('203.0.113.9', 'k'.repeat(32)));
    expect(hashIp('203.0.113.9', 'k'.repeat(32))).not.toBe(hashIp('203.0.113.9', 'j'.repeat(32)));
  });
  it('distingue IP distintas y devuelve 64 hexadecimales (lo que exige el CHECK de la base)', () => {
    expect(hashIp('203.0.113.9', 'k')).not.toBe(hashIp('203.0.113.10', 'k'));
    expect(hashIp('203.0.113.9', 'k')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('sin IP no hay hash', () => expect(hashIp(undefined, 'k')).toBeNull());
});

describe('clip', () => {
  it('recorta y quita caracteres de control (no entra nada ilegible ni larguísimo)', () => {
    expect(clip('a'.repeat(500), 120)).toHaveLength(120);
    expect(clip('lin\u0000ea\nnueva\u001b[31m', 50)).toBe('lineanueva[31m');
  });
  it('vacío o solo control → null', () => {
    expect(clip('', 10)).toBeNull();
    expect(clip('\u0000\n', 10)).toBeNull();
  });
});
