import { loadEnv } from './env.js';

describe('loadEnv', () => {
  const complete = { DATABASE_URL: 'postgresql://u:p@db:5432/x', REDIS_URL: 'redis://:p@redis:6379' };

  it('lee una configuración completa', () => {
    expect(loadEnv({ ...complete, PORT: '3000' })).toEqual({
      port: 3000,
      databaseUrl: complete.DATABASE_URL,
      redisUrl: complete.REDIS_URL,
    });
  });

  it('se niega a arrancar si falta una variable, sin mostrar valores', () => {
    expect(() => loadEnv({ REDIS_URL: complete.REDIS_URL })).toThrow('Falta la variable de entorno DATABASE_URL');
  });

  it('rechaza un puerto que no es entero positivo', () => {
    expect(() => loadEnv({ ...complete, PORT: 'abc' })).toThrow('PORT');
  });
});
