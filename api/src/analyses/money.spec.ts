import { fromCents, toCents } from './money.js';

describe('toCents / fromCents', () => {
  it('van y vienen sin perder nada', () => {
    for (const text of ['0.00', '0.01', '10.00', '1234.50', '-1234.50', '-0.01', '999999999999.99']) {
      expect(fromCents(toCents(text))).toBe(text);
    }
  });

  it('el cero siempre es «0.00» (nunca «-0.00»), venga como venga', () => {
    expect(fromCents(toCents('-0.00'))).toBe('0.00');
    expect(fromCents(0n)).toBe('0.00');
    expect(fromCents(toCents('0.10') - toCents('0.10'))).toBe('0.00');
  });

  it('suma sin el error del punto flotante: 0.10 + 0.20 es 0.30 (con Number sería 0.30000000000000004)', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // el problema que esto evita
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
  });

  it('sumar mil veces 0.10 da exactamente 100.00 (en flotante se acumula el error)', () => {
    let total = 0n;
    for (let i = 0; i < 1000; i++) total += toCents('0.10');
    expect(fromCents(total)).toBe('100.00');
    expect(Array.from({ length: 1000 }, () => 0.1).reduce((a, b) => a + b, 0)).not.toBe(100);
  });

  it('aguanta cifras que un número de JavaScript ya no representa con exactitud', () => {
    const huge = '90071992547409.93'; // más allá de 2^53 en centavos
    expect(Number.isSafeInteger(Number(huge.replace('.', '')))).toBe(false);
    expect(fromCents(toCents(huge) + toCents('0.01'))).toBe('90071992547409.94');
  });

  it('resta con signo', () => {
    expect(fromCents(toCents('100.00') - toCents('250.75'))).toBe('-150.75');
    expect(fromCents(toCents('-5.00') - toCents('-5.00'))).toBe('0.00');
  });

  it.each(['', '1', '1.5', '1.500', '.50', '1,234.50', '1e3', 'NaN', '--1.00', '+1.00', ' 1.00', '1.00 ', '١٢.٠٠'])(
    'rechaza «%s» en vez de «arreglarlo»',
    (bad) => expect(() => toCents(bad)).toThrow('Importe inválido'),
  );
});
