// Lee la configuración del entorno UNA vez y se niega a arrancar si falta algo.
// Fallar al arrancar es mejor que fallar a media petición con un error confuso.

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
}

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
  };
  if (!Number.isInteger(env.port) || env.port <= 0) {
    throw new Error('PORT debe ser un entero positivo');
  }
  if (env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }
  // Solo el origen (esquema + host + puerto), sin ruta ni barra final: se compara tal cual contra Origin.
  if (new URL(env.appOrigin).origin !== env.appOrigin) {
    throw new Error('APP_ORIGIN debe ser un origen sin ruta, p. ej. http://localhost:3070');
  }

  if (source === process.env) cached = env;
  return env;
}

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name];
  // El mensaje nombra la variable, nunca su valor: puede ser un secreto.
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}
