// Aritmética de dinero con ENTEROS de centavos (`BigInt`). Nunca `Number`: 0.1 + 0.2 da 0.30000000000000004 en punto
// flotante, y una resta de ventas menos gastos acumularía ese error mes a mes. Los importes del worker ya llegan como
// texto decimal exacto con dos decimales (el patrón `Money` del contrato); aquí solo se suman y restan enteros.

const MONEY = /^(-?)(\d+)\.(\d{2})$/;

/** «-1234.50» → -123450n. Un texto que no sea un importe exacto de dos decimales se rechaza (no se «arregla»). */
export function toCents(text: string): bigint {
  const match = MONEY.exec(text);
  if (!match) throw new Error('Importe inválido');
  const cents = BigInt(match[2]) * 100n + BigInt(match[3]);
  return match[1] === '-' ? -cents : cents;
}

/** -123450n → «-1234.50». El cero siempre sale «0.00» (nunca «-0.00»). */
export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const text = `${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}
