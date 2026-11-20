import { DEMO_ACCOUNT_TTL_S, loadDemo } from './demo-env.js';

describe('loadDemo (configuración de la demo de 24 h)', () => {
  it('sin DEMO_MODE no hay demo: Atalaya funciona como siempre', () => {
    expect(loadDemo({})).toBeNull();
    expect(loadDemo({ DEMO_MODE: 'false' })).toBeNull();
  });

  it('con DEMO_MODE=true: 24 h, 50 cuentas, 30 subidas y 20 análisis por día', () => {
    expect(loadDemo({ DEMO_MODE: 'true' })).toEqual({ accountTtlS: DEMO_ACCOUNT_TTL_S, maxAccounts: 50, uploadsPerDay: 30, analysesPerDay: 20 });
  });

  it('rechaza un DEMO_MODE que no sea true/false (un «1» o un «yes» no encienden nada a medias)', () => {
    expect(() => loadDemo({ DEMO_MODE: '1' })).toThrow('DEMO_MODE');
  });

  it('la vida se puede ACORTAR en desarrollo (de 10 s a 24 h), nunca alargar', () => {
    expect(loadDemo({ DEMO_MODE: 'true', DEMO_ACCOUNT_TTL_S: '20' })?.accountTtlS).toBe(20);
    expect(() => loadDemo({ DEMO_MODE: 'true', DEMO_ACCOUNT_TTL_S: '9' })).toThrow('DEMO_ACCOUNT_TTL_S');
    expect(() => loadDemo({ DEMO_MODE: 'true', DEMO_ACCOUNT_TTL_S: '86401' })).toThrow('DEMO_ACCOUNT_TTL_S');
    expect(() => loadDemo({ DEMO_MODE: 'true', DEMO_ACCOUNT_TTL_S: '1.5' })).toThrow('DEMO_ACCOUNT_TTL_S');
  });

  it('en producción la vida es exactamente 24 h: es lo que el aviso le promete a quien se registra', () => {
    expect(() => loadDemo({ DEMO_MODE: 'true', NODE_ENV: 'production', DEMO_ACCOUNT_TTL_S: '60' })).toThrow('86400');
    expect(loadDemo({ DEMO_MODE: 'true', NODE_ENV: 'production' })?.accountTtlS).toBe(DEMO_ACCOUNT_TTL_S);
  });

  it('el tope global es un entero de 1 a 10 000', () => {
    expect(loadDemo({ DEMO_MODE: 'true', DEMO_MAX_ACCOUNTS: '3' })?.maxAccounts).toBe(3);
    expect(() => loadDemo({ DEMO_MODE: 'true', DEMO_MAX_ACCOUNTS: '0' })).toThrow('DEMO_MAX_ACCOUNTS');
    expect(() => loadDemo({ DEMO_MODE: 'true', DEMO_MAX_ACCOUNTS: 'muchas' })).toThrow('DEMO_MAX_ACCOUNTS');
  });
});
