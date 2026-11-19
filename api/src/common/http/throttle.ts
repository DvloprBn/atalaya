import { loadEnv } from '../../config/env.js';

/**
 * Los topes por IP de las rutas de acceso (`@Throttle`) pasan por aquí.
 *
 * En PRODUCCIÓN el factor es 1: se aplican tal cual. En desarrollo y en el CI el compose lo
 * sube (THROTTLE_SCALE en docker-compose.yml) por una razón práctica: las suites de pruebas salen todas de UNA
 * misma IP y juntas hacen más entradas por minuto de las que un humano haría. El tope POR
 * CUENTA (rate-limits.ts), que es la defensa fuerte contra adivinar contraseñas y códigos, NO
 * se escala. En producción un factor distinto de 1 impide arrancar (config/env.ts).
 */
export const scaled = (limit: number) => () => limit * loadEnv().throttleScale;
