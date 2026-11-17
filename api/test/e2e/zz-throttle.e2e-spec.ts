// Último en correr: gasta el tope de una ruta pública para comprobar que EXISTE (OWASP API4).
// En desarrollo y en el CI los topes se multiplican (THROTTLE_SCALE, ver common/http/throttle.ts)
// porque todas las suites salen de una misma IP; por eso aquí se comprueba lo esencial: que
// llega un 429, y que NUNCA antes del tope de producción (5 por 15 minutos).
import { Browser } from './helpers.js';

const PROD_LIMIT = 5; // @Throttle de /auth/accept-invite
const TOKEN = 'A'.repeat(43); // con forma válida: llega al servicio y responde 400, no 400 de validación

describe('tope por IP en una ruta de acceso', () => {
  it('/auth/accept-invite responde 429 tras un tope finito y nunca antes del de producción', async () => {
    const browser = new Browser();
    let firstBlocked = 0;
    for (let i = 1; i <= 120 && !firstBlocked; i++) {
      const res = await browser.post('/api/auth/accept-invite', { token: TOKEN, password: 'una frase larga de prueba' });
      if (res.status === 429) firstBlocked = i;
      else expect(res.status).toBe(400);
    }
    expect(firstBlocked).toBeGreaterThan(PROD_LIMIT); // nunca bloquea ANTES del valor de producción
    expect(firstBlocked).toBeGreaterThan(0); // y bloquea en algún momento
  });
});
