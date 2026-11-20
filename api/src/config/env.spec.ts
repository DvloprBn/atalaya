import { loadEnv } from './env.js';

describe('loadEnv', () => {
  const complete = {
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    REDIS_URL: 'redis://:p@redis:6379',
    JWT_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'http://localhost:3070',
    SMTP_URL: 'smtp://mailpit:1025',
    MAIL_FROM: 'Atalaya <no-reply@example.com>',
    TOTP_ENCRYPTION_KEY: 'ab'.repeat(32),
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

  it('rechaza una llave de cifrado que no sea de 64 hexadecimales (también el ejemplo del .env.example)', () => {
    expect(() => loadEnv({ ...complete, TOTP_ENCRYPTION_KEY: 'cambia-esto' })).toThrow('TOTP_ENCRYPTION_KEY');
    expect(() => loadEnv({ ...complete, TOTP_ENCRYPTION_KEY: 'ab'.repeat(31) })).toThrow('TOTP_ENCRYPTION_KEY');
  });

  it('THROTTLE_SCALE vale 1 por defecto, acepta 1–20 y en producción obliga a 1', () => {
    expect(loadEnv(complete).throttleScale).toBe(1);
    expect(loadEnv({ ...complete, THROTTLE_SCALE: '5' }).throttleScale).toBe(5);
    expect(() => loadEnv({ ...complete, THROTTLE_SCALE: '0' })).toThrow('THROTTLE_SCALE');
    expect(() => loadEnv({ ...complete, THROTTLE_SCALE: '2.5' })).toThrow('THROTTLE_SCALE');
    expect(() => loadEnv({ ...complete, THROTTLE_SCALE: '5', NODE_ENV: 'production' })).toThrow('producción');
    expect(loadEnv({ ...complete, NODE_ENV: 'production' }).throttleScale).toBe(1);
  });

  it('S-3: en producción rechaza valores de ejemplo (con 32+ caracteres que pasarían el resto) y no muestra el valor', () => {
    const example = 'cambia-esto-por-64-caracteres-aleatorios-de-openssl-rand-hex-32';
    expect(() => loadEnv({ ...complete, JWT_SECRET: example, NODE_ENV: 'production' })).toThrow('JWT_SECRET conserva');
    expect(() => loadEnv({ ...complete, JWT_SECRET: example, NODE_ENV: 'production' })).not.toThrow(example);
    expect(() => loadEnv({ ...complete, REDIS_URL: 'redis://:cambia-esto-tambien@redis:6379', NODE_ENV: 'production' })).toThrow('REDIS_URL');
    expect(() => loadEnv({ ...complete, DATABASE_URL: 'postgresql://u:cambia-esto-por-una@db/x', NODE_ENV: 'production' })).toThrow('DATABASE_URL');
    // En desarrollo el ejemplo sigue valiendo (es el flujo de «copia .env.example y arranca»).
    expect(loadEnv({ ...complete, JWT_SECRET: example }).jwtSecret).toBe(example);
    expect(loadEnv({ ...complete, NODE_ENV: 'production' }).port).toBe(3000);
  });

  it('S-9: TOTP_ENCRYPTION_KEYS_OLD es opcional, admite varias separadas por comas y rechaza una mal formada sin mostrarla', () => {
    expect(loadEnv(complete).totpEncryptionKeysOld).toEqual([]);
    const a = 'cd'.repeat(32), b = 'ef'.repeat(32);
    expect(loadEnv({ ...complete, TOTP_ENCRYPTION_KEYS_OLD: ` ${a} , ${b},` }).totpEncryptionKeysOld).toEqual([a, b]);
    const bad = 'zz'.repeat(32);
    expect(() => loadEnv({ ...complete, TOTP_ENCRYPTION_KEYS_OLD: `${a},${bad}` })).toThrow('TOTP_ENCRYPTION_KEYS_OLD');
    expect(() => loadEnv({ ...complete, TOTP_ENCRYPTION_KEYS_OLD: `${a},${bad}` })).not.toThrow(bad);
  });

  it('S-10: la espera del restablecimiento vale 48 h, se puede bajar fuera de producción y en producción no se acorta', () => {
    expect(loadEnv(complete).twoFactorResetDelayS).toBe(172_800);
    expect(loadEnv({ ...complete, TWO_FACTOR_RESET_DELAY_S: '5' }).twoFactorResetDelayS).toBe(5);
    expect(() => loadEnv({ ...complete, TWO_FACTOR_RESET_DELAY_S: '0' })).toThrow('TWO_FACTOR_RESET_DELAY_S');
    expect(() => loadEnv({ ...complete, TWO_FACTOR_RESET_DELAY_S: '999999' })).toThrow('TWO_FACTOR_RESET_DELAY_S');
    expect(() => loadEnv({ ...complete, TWO_FACTOR_RESET_DELAY_S: '5', NODE_ENV: 'production' })).toThrow('no se acorta');
    expect(loadEnv({ ...complete, NODE_ENV: 'production' }).twoFactorResetDelayS).toBe(172_800);
  });

  describe('OAuth (login con Google)', () => {
    const oauth = {
      OAUTH_CLIENT_ID: 'id', OAUTH_CLIENT_SECRET: 's', OAUTH_ISSUER: 'https://accounts.google.com',
      OAUTH_AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
      OAUTH_TOKEN_URL: 'https://oauth2.googleapis.com/token',
      OAUTH_JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
    };

    it('sin ninguna variable queda apagado (null)', () => {
      expect(loadEnv(complete).oauth).toBeNull();
    });

    it('con todas, queda configurado y acepta las dos formas del emisor de Google', () => {
      expect(loadEnv({ ...complete, ...oauth }).oauth?.issuers).toEqual(['https://accounts.google.com', 'accounts.google.com']);
      expect(loadEnv({ ...complete, ...oauth, OAUTH_ISSUER: 'http://mock-idp:4000' }).oauth?.issuers).toEqual(['http://mock-idp:4000']);
    });

    it('con una variable a medias no arranca, y nombra cuál falta', () => {
      const { OAUTH_JWKS_URL: _omitted, ...rest } = oauth;
      expect(() => loadEnv({ ...complete, ...rest })).toThrow('OAUTH_JWKS_URL');
    });

    it('una URL inválida no arranca; y en producción solo https', () => {
      expect(() => loadEnv({ ...complete, ...oauth, OAUTH_TOKEN_URL: 'no-es-url' })).toThrow('OAUTH_TOKEN_URL');
      const insecure = { ...oauth, OAUTH_TOKEN_URL: 'http://mock-idp:4000/token' };
      expect(loadEnv({ ...complete, ...insecure }).oauth).not.toBeNull(); // desarrollo: permitido
      expect(() => loadEnv({ ...complete, ...insecure, NODE_ENV: 'production' })).toThrow('https');
    });
  });

  it('rechaza un APP_ORIGIN con ruta o barra final', () => {
    expect(() => loadEnv({ ...complete, APP_ORIGIN: 'http://localhost:3070/' })).toThrow('APP_ORIGIN');
  });
});
