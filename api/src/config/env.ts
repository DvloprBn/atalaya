// Lee la configuración del entorno UNA vez y se niega a arrancar si falta algo.
// Fallar al arrancar es mejor que fallar a media petición con un error confuso.

export interface Env {
  port: number;
  databaseUrl: string;
  redisUrl: string;
}

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;

  const env: Env = {
    port: Number(source.PORT ?? 3000),
    databaseUrl: required(source, 'DATABASE_URL'),
    redisUrl: required(source, 'REDIS_URL'),
  };
  if (!Number.isInteger(env.port) || env.port <= 0) {
    throw new Error('PORT debe ser un entero positivo');
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
