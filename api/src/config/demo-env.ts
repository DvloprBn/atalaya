// v1.0 · La configuración de la demo de 24 h (PLAN_DESARROLLO.md §6). Aparte de env.ts para que cada archivo se lea solo.
// Sin DEMO_MODE=true, Atalaya funciona como siempre: cuentas permanentes y ninguno de estos límites.

export interface DemoConfig {
  /** Cuánto vive una cuenta nueva. 24 h; desarrollo y CI lo bajan para probar el barrido sin esperar un día. */
  accountTtlS: number;
  /** Tope GLOBAL de cuentas de prueba vivas: sin él, un script llena la base y el disco registrando correos. */
  maxAccounts: number;
  /** Análisis que una cuenta puede EMPEZAR en 24 h (borrar uno no devuelve el cupo). */
  analysesPerDay: number;
  /** Subidas que una cuenta puede hacer en 24 h. Sin él, borrar y volver a subir ocupa al worker sin fin (API4). */
  uploadsPerDay: number;
}

/** La vida de una cuenta de prueba decidida en el arranque (2026-11-17): 24 horas. */
export const DEMO_ACCOUNT_TTL_S = 24 * 60 * 60;
export const DEMO_ANALYSES_PER_DAY = 20;
export const DEMO_UPLOADS_PER_DAY = 30;
const DEFAULT_MAX_ACCOUNTS = 50;

/** null = sin demo. Se niega a arrancar con un valor raro: mejor no arrancar que borrar cuentas a destiempo. */
export function loadDemo(source: NodeJS.ProcessEnv): DemoConfig | null {
  const mode = source.DEMO_MODE ?? 'false';
  if (mode !== 'true' && mode !== 'false') throw new Error('DEMO_MODE debe ser true o false');
  if (mode === 'false') return null;

  const accountTtlS = Number(source.DEMO_ACCOUNT_TTL_S ?? DEMO_ACCOUNT_TTL_S);
  const maxAccounts = Number(source.DEMO_MAX_ACCOUNTS ?? DEFAULT_MAX_ACCOUNTS);
  if (!Number.isInteger(accountTtlS) || accountTtlS < 10 || accountTtlS > DEMO_ACCOUNT_TTL_S) {
    throw new Error('DEMO_ACCOUNT_TTL_S debe ser un entero de 10 a 86400 (24 h)');
  }
  // El aviso le promete a quien se registra «se borra en 24 h»: en producción la cifra no se mueve.
  if (source.NODE_ENV === 'production' && accountTtlS !== DEMO_ACCOUNT_TTL_S) {
    throw new Error('En producción DEMO_ACCOUNT_TTL_S debe ser 86400 (24 h)');
  }
  if (!Number.isInteger(maxAccounts) || maxAccounts < 1 || maxAccounts > 10_000) {
    throw new Error('DEMO_MAX_ACCOUNTS debe ser un entero de 1 a 10000');
  }
  return { accountTtlS, maxAccounts, analysesPerDay: DEMO_ANALYSES_PER_DAY, uploadsPerDay: DEMO_UPLOADS_PER_DAY };
}
