import type { RedisService } from '../../redis/redis.service.js';
import { OAuthStates } from './state-store.js';

/** Redis de mentira: solo lo que usa el almacén. `getdel` lee Y borra, como el de verdad. */
function fakeRedis() {
  const data = new Map<string, string>();
  const client = {
    set: vi.fn(async (key: string, value: string) => (data.set(key, value), 'OK')),
    getdel: vi.fn(async (key: string) => {
      const value = data.get(key) ?? null;
      data.delete(key);
      return value;
    }),
  };
  return { redis: { client } as unknown as RedisService, data };
}
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

describe('OAuthStates', () => {
  it('un intento se canjea con su state y la cookie de ESE navegador, y devuelve nonce y verifier', async () => {
    const { redis } = fakeRedis();
    const states = new OAuthStates(redis);
    const attempt = await states.create();
    expect(await states.consume(attempt.state, attempt.binding)).toEqual({ nonce: attempt.nonce, verifier: attempt.verifier });
  });

  it('es de UN solo uso: repetir el regreso falla', async () => {
    const states = new OAuthStates(fakeRedis().redis);
    const attempt = await states.create();
    await states.consume(attempt.state, attempt.binding);
    expect(await code(states.consume(attempt.state, attempt.binding))).toBe('state_unknown');
  });

  it('login CSRF: el state correcto SIN la cookie (o con la de otro intento) se rechaza', async () => {
    const states = new OAuthStates(fakeRedis().redis);
    const victim = await states.create();
    const attacker = await states.create();
    expect(await code(states.consume(victim.state, undefined))).toBe('binding_mismatch');
    expect(await code(states.consume(attacker.state, victim.binding))).toBe('binding_mismatch');
  });

  it('un fallo de cookie GASTA el intento: no se puede reintentar con la cookie buena después', async () => {
    const states = new OAuthStates(fakeRedis().redis);
    const attempt = await states.create();
    expect(await code(states.consume(attempt.state, 'x'.repeat(43)))).toBe('binding_mismatch');
    expect(await code(states.consume(attempt.state, attempt.binding))).toBe('state_unknown');
  });

  it('rechaza un state con forma rara y uno que no existe', async () => {
    const states = new OAuthStates(fakeRedis().redis);
    expect(await code(states.consume("' OR 1=1", 'x'))).toBe('bad_request');
    expect(await code(states.consume('A'.repeat(43), 'x'))).toBe('state_unknown');
  });

  it('Redis guarda solo hashes: ni el state ni la cookie aparecen en claro', async () => {
    const { redis, data } = fakeRedis();
    const attempt = await new OAuthStates(redis).create();
    const dump = JSON.stringify([...data]);
    expect(dump).not.toContain(attempt.state);
    expect(dump).not.toContain(attempt.binding);
    expect(dump).toContain(attempt.verifier); // el verifier sí se guarda: se necesita para el canje (vive 10 min)
  });
});
