import { mappingProblem, normalizeMapping } from './mapping.js';

describe('mappingProblem', () => {
  it('acepta un mapeo con columnas distintas y existentes', () => {
    expect(mappingProblem({ date: 0, amount: 3, product: 1 }, 4)).toBeNull();
  });

  it('rechaza una columna que no existe en ESE archivo (la última válida es columnCount - 1)', () => {
    expect(mappingProblem({ date: 0, amount: 3 }, 4)).toBeNull();
    expect(mappingProblem({ date: 0, amount: 4 }, 4)).toContain('no existe');
    expect(mappingProblem({ date: 0, amount: 0 }, 0)).toContain('no existe'); // sin vista previa, nada es válido
  });

  it('rechaza dos campos en la misma columna, diciendo cuáles', () => {
    expect(mappingProblem({ date: 1, amount: 1 }, 4)).toBe('«date» y «amount» no pueden ser la misma columna');
    expect(mappingProblem({ date: 0, amount: 1, product: 2, branch: 2 }, 4)).toContain('«product» y «branch»');
  });

  it('el 0 es una columna válida (no se confunde con «sin elegir»)', () => {
    expect(mappingProblem({ date: 0, amount: 1, quantity: 0 }, 4)).toContain('«date» y «quantity»');
  });
});

describe('normalizeMapping', () => {
  it('guarda solo lo elegido y pone los valores por omisión del contrato', () => {
    expect(normalizeMapping({ date: 2, amount: 5 })).toEqual({ date: 2, amount: 5, dateOrder: 'auto', decimalSeparator: 'auto' });
  });

  it('respeta las opciones dadas y conserva el 0', () => {
    expect(normalizeMapping({ date: 0, amount: 1, orderId: 0 + 2, dateOrder: 'mdy', decimalSeparator: ',' })).toEqual({
      date: 0, amount: 1, orderId: 2, dateOrder: 'mdy', decimalSeparator: ',',
    });
  });
});
