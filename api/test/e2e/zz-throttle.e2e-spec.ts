// Último en correr: gasta el tope de una ruta pública para comprobar que EXISTE (OWASP API4).
// En desarrollo y en el CI los topes se multiplican (THROTTLE_SCALE, ver common/http/throttle.ts)
// porque todas las suites salen de una misma IP; por eso aquí se comprueba lo esencial: que
// llega un 429, y que NUNCA antes del tope de producción (5 por 15 minutos).
import { Browser } from './helpers.js';

const PROD_LIMIT = 5; // @Throttle de /auth/accept-invite
const TOKEN = 'A'.repeat(43); // con forma válida: llega al servicio y responde 400, no 400 de validación

describe('tope por IP en una ruta de acceso', () => {
  const startedAt = Date.now();

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

  it('v0.7: pasarse del tope queda en la bitácora UNA vez (con la ruta registrada, no la URL) aunque se insista', async () => {
    const admin = new Browser();
    await admin.post('/api/auth/login', { email: 'admin@example.com', password: 'TestOnly123!' });
    const list = (await admin.get('/api/admin/security/events?type=rate_limited')).body.items as { detail: string; createdAt: string }[];
    // Solo los de ESTA corrida (los de corridas anteriores siguen en la bitácora, como debe ser).
    expect(list.filter((e) => e.detail === 'POST /api/auth/accept-invite' && Date.parse(e.createdAt) >= startedAt)).toHaveLength(1);
  });
});
