import { loadEnv } from './env.js';

describe('loadEnv', () => {
  const complete = {
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    REDIS_URL: 'redis://:p@redis:6379',
    JWT_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'http://localhost:3070',
    SMTP_URL: 'smtp://mailpit:1025',
    MAIL_FROM: 'Atalaya <no-reply@example.com>',
  };

  it('lee una configuración completa', () => {
    expect(loadEnv({ ...complete, PORT: '3000' })).toMatchObject({ port: 3000, appOrigin: 'http://localhost:3070' });
  });

  it('se niega a arrancar si falta una variable, sin mostrar valores', () => {
    const { DATABASE_URL: _omitted, ...rest } = complete;
    expect(() => loadEnv(rest)).toThrow('Falta la variable de entorno DATABASE_URL');
  });

  it('rechaza un puerto que no es entero positivo', () => {
    expect(() => loadEnv({ ...complete, PORT: 'abc' })).toThrow('PORT');
  });

  it('rechaza una firma de JWT corta', () => {
    expect(() => loadEnv({ ...complete, JWT_SECRET: 'corta' })).toThrow('JWT_SECRET');
  });

  it('rechaza un APP_ORIGIN con ruta o barra final', () => {
    expect(() => loadEnv({ ...complete, APP_ORIGIN: 'http://localhost:3070/' })).toThrow('APP_ORIGIN');
  });
});
