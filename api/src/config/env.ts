// Lee la configuración del entorno UNA vez y se niega a arrancar si falta algo.
// Fallar al arrancar es mejor que fallar a media petición con un error confuso.
import { type DemoConfig, loadDemo } from './demo-env.js';

/** Un proveedor OpenID Connect (Google). Los endpoints vienen del entorno, nunca de lo que escribe un visitante. */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  /** A dónde manda el NAVEGADOR a la persona (pantalla de Google). */
  authUrl: string;
  /** A dónde llama el SERVIDOR para canjear el código. */
  tokenUrl: string;
  /** Las llaves públicas con las que se verifica la firma del id_token. */
  jwksUrl: string;
  /** Valores aceptados para `iss` en el id_token. */
  issuers: string[];
}

export interface Env {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Firma de los JWT. Mínimo 32 caracteres (256 bits si es aleatoria). */
  jwtSecret: string;
  /** Origen público del sitio, p. ej. http://localhost:3070. Para enlaces de correo y contra CSRF. */
  appOrigin: string;
  /** Servidor de correo: smtp://mailpit:1025 en local; smtps://usuario:llave@host:465 en el demo. */
  smtpUrl: string;
  mailFrom: string;
  /** Llave AES-256 (64 hexadecimales) con la que se cifran los secretos TOTP. Vive en el entorno, nunca en la base. */
  totpEncryptionKey: string;
  /** S-9: llaves ANTERIORES (solo descifran) mientras dura una rotación. Vacío fuera de una rotación. */
  totpEncryptionKeysOld: string[];
  /** Multiplica los topes por IP de las rutas de acceso. 1 en producción (ver common/http/throttle.ts). */
  throttleScale: number;
  /** Carpeta de los archivos subidos (volumen compartido con el worker, que la monta en solo lectura). */
  uploadDir: string;
  /** Carpeta de los resultados de los análisis (CSV). El worker escribe; la API los entrega y los borra. */
  resultsDir: string;
  /** S-10: segundos entre que un admin pide quitar un 2FA y que se aplica. 48 h; en producción no se cambia. */
  twoFactorResetDelayS: number;
  /** null = el login con Google no está configurado (las rutas responden 404). */
  oauth: OAuthConfig | null;
  /** v1.0 · null = sin demo (cuentas permanentes). Ver demo-env.ts. */
  demo: DemoConfig | null;
}

/** S-10: la espera decidida por el dueño (2026-11-20): 48 horas. */
export const TWO_FACTOR_RESET_DELAY_S = 48 * 60 * 60;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;

  const env: Env = {
    port: Number(source.PORT ?? 3000),
    databaseUrl: required(source, 'DATABASE_URL'),
    redisUrl: required(source, 'REDIS_URL'),
    jwtSecret: required(source, 'JWT_SECRET'),
    appOrigin: required(source, 'APP_ORIGIN'),
    smtpUrl: required(source, 'SMTP_URL'),
    mailFrom: required(source, 'MAIL_FROM'),
    totpEncryptionKey: required(source, 'TOTP_ENCRYPTION_KEY'),
    // Separadas por comas: «la de hace un mes,la de hace dos». Espacios y comas sobrantes se ignoran.
    totpEncryptionKeysOld: (source.TOTP_ENCRYPTION_KEYS_OLD ?? '').split(',').map((k) => k.trim()).filter(Boolean),
    throttleScale: Number(source.THROTTLE_SCALE ?? 1),
    uploadDir: source.UPLOAD_DIR ?? '/data/uploads',
    resultsDir: source.RESULTS_DIR ?? '/data/results',
    // SOLO desarrollo y CI lo bajan (segundos), para probar la aplicación sin esperar dos días. Ver la validación abajo.
    twoFactorResetDelayS: Number(source.TWO_FACTOR_RESET_DELAY_S ?? TWO_FACTOR_RESET_DELAY_S),
    oauth: loadOAuth(source),
    demo: loadDemo(source),
  };
  if (!Number.isInteger(env.port) || env.port <= 0) {
    throw new Error('PORT debe ser un entero positivo');
  }
  if (env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }
  if (!/^[0-9a-f]{64}$/i.test(env.totpEncryptionKey)) {
    throw new Error('TOTP_ENCRYPTION_KEY debe ser de 64 caracteres hexadecimales (openssl rand -hex 32)');
  }
  if (env.totpEncryptionKeysOld.some((k) => !/^[0-9a-f]{64}$/i.test(k))) {
    // No se dice cuál: el mensaje no debe mostrar llaves, ni siquiera una mal escrita.
    throw new Error('TOTP_ENCRYPTION_KEYS_OLD: cada llave debe ser de 64 hexadecimales, separadas por comas');
  }
  if (!Number.isInteger(env.throttleScale) || env.throttleScale < 1 || env.throttleScale > 20) {
    throw new Error('THROTTLE_SCALE debe ser un entero de 1 a 20');
  }
  if (source.NODE_ENV === 'production' && env.throttleScale !== 1) {
    throw new Error('En producción THROTTLE_SCALE debe ser 1: los topes por IP no se aflojan');
  }
  if (source.NODE_ENV === 'production') rejectExampleValues(source);
  if (!Number.isInteger(env.twoFactorResetDelayS) || env.twoFactorResetDelayS < 1 || env.twoFactorResetDelayS > TWO_FACTOR_RESET_DELAY_S) {
    throw new Error('TWO_FACTOR_RESET_DELAY_S debe ser un entero de 1 a 172800 (48 h)');
  }
  // La espera ES la defensa contra quien engañe a un admin (S-10): en producción no se acorta, igual que THROTTLE_SCALE.
  if (source.NODE_ENV === 'production' && env.twoFactorResetDelayS !== TWO_FACTOR_RESET_DELAY_S) {
    throw new Error('En producción TWO_FACTOR_RESET_DELAY_S debe ser 172800 (48 h): la espera no se acorta');
  }
  if (!env.uploadDir.startsWith('/')) throw new Error('UPLOAD_DIR debe ser una ruta absoluta');
  if (!env.resultsDir.startsWith('/')) throw new Error('RESULTS_DIR debe ser una ruta absoluta');
  // Solo el origen (esquema + host + puerto), sin ruta ni barra final: se compara tal cual contra Origin.
  if (new URL(env.appOrigin).origin !== env.appOrigin) {
    throw new Error('APP_ORIGIN debe ser un origen sin ruta, p. ej. http://localhost:3070');
  }

  if (source === process.env) cached = env;
  return env;
}

/**
 * S-3: en producción, un valor copiado del `.env.example` (todos empiezan por «cambia-esto») es una
 * llave pública: cualquiera que lea el repo podría firmar sesiones. Se revisan también las URLs,
 * que llevan las contraseñas de base y de Redis incrustadas. El mensaje nombra la variable, no el valor.
 */
const SECRET_VARS = ['JWT_SECRET', 'TOTP_ENCRYPTION_KEY', 'TOTP_ENCRYPTION_KEYS_OLD', 'OAUTH_CLIENT_SECRET', 'DATABASE_URL', 'REDIS_URL', 'SMTP_URL'];
function rejectExampleValues(source: NodeJS.ProcessEnv): void {
  for (const name of SECRET_VARS) {
    if (/cambia-esto|changeme|change-me/i.test(source[name] ?? '')) {
      throw new Error(`En producción ${name} conserva el valor de ejemplo de .env.example: genera uno propio`);
    }
  }
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  // El mensaje nombra la variable, nunca su valor: puede ser un secreto.
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const OAUTH_VARS = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_AUTH_URL', 'OAUTH_TOKEN_URL', 'OAUTH_JWKS_URL', 'OAUTH_ISSUER'];

/** Todo o nada: con una variable a medias, mejor no arrancar que fallar a media petición. */
function loadOAuth(source: NodeJS.ProcessEnv): OAuthConfig | null {
  const present = OAUTH_VARS.filter((name) => source[name]);
  if (present.length === 0) return null;
  const missing = OAUTH_VARS.filter((name) => !source[name]);
  if (missing.length > 0) throw new Error(`Configuración de OAuth incompleta: falta ${missing.join(', ')}`);

  const urls = ['OAUTH_AUTH_URL', 'OAUTH_TOKEN_URL', 'OAUTH_JWKS_URL'].map((name) => {
    const value = source[name] as string;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${name} no es una URL válida`);
    }
    // En producción el canje del código y las llaves viajan SOLO por HTTPS.
    if (source.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error(`En producción ${name} debe ser https`);
    }
    return value;
  });
  const issuer = source.OAUTH_ISSUER as string;
  return {
    clientId: source.OAUTH_CLIENT_ID as string,
    clientSecret: source.OAUTH_CLIENT_SECRET as string,
    authUrl: urls[0],
    tokenUrl: urls[1],
    jwksUrl: urls[2],
    // Google publica el emisor de dos formas; las dos son legítimas.
    issuers: issuer === 'https://accounts.google.com' ? [issuer, 'accounts.google.com'] : [issuer],
  };
}
