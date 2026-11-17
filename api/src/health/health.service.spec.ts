import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { HealthService, WORKER_HEARTBEAT_KEY } from './health.service.js';

// Dobles de prueba: solo implementan lo que HealthService usa.
function build({ dbOk = true, redisOk = true, heartbeat = true } = {}) {
  const prisma = {
    $queryRaw: () => (dbOk ? Promise.resolve([{ '?column?': 1 }]) : Promise.reject(new Error('db caída'))),
  } as unknown as PrismaService;
  const redis = {
    client: {
      ping: () => (redisOk ? Promise.resolve('PONG') : Promise.reject(new Error('redis caído'))),
      exists: (key: string) => Promise.resolve(heartbeat && key === WORKER_HEARTBEAT_KEY ? 1 : 0),
    },
  } as unknown as RedisService;
  return new HealthService(prisma, redis);
}

describe('HealthService', () => {
  it('reporta ok cuando base, Redis y worker responden', async () => {
    expect(await build().check()).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok', worker: 'ok' },
    });
  });

  it('reporta degraded y señala solo la pieza caída', async () => {
    const report = await build({ heartbeat: false }).check();
    expect(report.status).toBe('degraded');
    expect(report.checks).toEqual({ database: 'ok', redis: 'ok', worker: 'down' });
  });

  it('nunca expone el mensaje del error (podría revelar hosts o versiones)', async () => {
    const report = await build({ dbOk: false }).check();
    expect(JSON.stringify(report)).not.toContain('db caída');
  });
});
