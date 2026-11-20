import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { RedisService } from '../redis/redis.service.js';

const BASE = {
  DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x', JWT_SECRET: 'x'.repeat(32), APP_ORIGIN: 'http://localhost:3070',
  SMTP_URL: 'smtp://x:1025', MAIL_FROM: 'x@example.com', TOTP_ENCRYPTION_KEY: 'ab'.repeat(32),
};

/** loadEnv guarda la configuración del proceso: cada caso carga el módulo de nuevo con su entorno. */
async function build(env: Record<string, string>, active = 0) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...BASE, ...env })) vi.stubEnv(k, v);
  const { DemoService } = await import('./demo.service.js');
  const counts: number[] = [];
  const exec = vi.fn(async () => [[null, counts.shift() ?? 1]]);
  const multi = { incr: vi.fn().mockReturnThis(), expire: vi.fn().mockReturnThis(), exec };
  const redis = { client: { multi: () => multi, decr: vi.fn() } };
  const tx = { $executeRaw: vi.fn(), user: { count: vi.fn().mockResolvedValue(active) } };
  const service = new DemoService(redis as unknown as RedisService);
  return { service, tx: tx as unknown as Prisma.TransactionClient, rawTx: tx, redis, multi, counts };
}

afterEach(() => vi.unstubAllEnvs());

describe('DemoService sin demo', () => {
  it('no reserva lugar, no cobra cupos y lo dice en /api/demo', async () => {
    const { service, tx, rawTx, multi } = await build({ DEMO_MODE: 'false' });
    expect(await service.reserveSeat(tx)).toBeNull();
    await service.consume('analyses', 'u1');
    expect(rawTx.$executeRaw).not.toHaveBeenCalled();
    expect(multi.incr).not.toHaveBeenCalled();
    expect(service.info()).toEqual({ enabled: false, accountHours: 0, limits: null });
  });
});

describe('DemoService con demo', () => {
  it('una cuenta nueva nace con su fecha de borrado (ahora + la vida configurada), con candado', async () => {
    const { service, tx, rawTx } = await build({ DEMO_MODE: 'true' });
    const before = Date.now();
    const expiresAt = await service.reserveSeat(tx);
    expect(rawTx.$executeRaw).toHaveBeenCalledTimes(1); // pg_advisory_xact_lock: dos altas a la vez no cuentan «49» las dos
    expect(expiresAt!.getTime() - before).toBeGreaterThanOrEqual(24 * 3600 * 1000 - 50);
    expect(expiresAt!.getTime() - before).toBeLessThanOrEqual(24 * 3600 * 1000 + 1000);
  });

  it('con el tope global lleno, 503 (la transacción se deshace y el enlace de registro sigue sirviendo)', async () => {
    const { service, tx, rawTx } = await build({ DEMO_MODE: 'true', DEMO_MAX_ACCOUNTS: '3' }, 3);
    await expect(service.reserveSeat(tx)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.assertNotFull(tx)).rejects.toBeInstanceOf(ServiceUnavailableException);
    // Solo cuentan las VIVAS: una vencida aún sin barrer no ocupa lugar.
    expect(rawTx.user.count).toHaveBeenCalledWith({ where: { expiresAt: { gt: expect.any(Date) } } });
  });

  it('con lugar, deja pasar', async () => {
    const { service, tx } = await build({ DEMO_MODE: 'true', DEMO_MAX_ACCOUNTS: '3' }, 2);
    await expect(service.reserveSeat(tx)).resolves.toBeInstanceOf(Date);
  });

  it('cupo de 24 h: el 20.º análisis pasa, el 21.º es 429 con un mensaje claro', async () => {
    const { service, counts, multi } = await build({ DEMO_MODE: 'true' });
    counts.push(20, 21);
    await expect(service.consume('analyses', 'u1')).resolves.toBeUndefined();
    const error = await service.consume('analyses', 'u1').catch((e: HttpException) => e);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toContain('20 análisis cada 24 horas');
    // La vigencia del contador se pone UNA vez (NX): el contador nunca es eterno ni se reinicia con cada uso.
    expect(multi.expire).toHaveBeenCalledWith('atalaya:demo:analyses:u1', 86400, 'NX');
  });

  it('el cupo de subidas es otro contador (30)', async () => {
    const { service, counts, multi } = await build({ DEMO_MODE: 'true' });
    counts.push(31);
    await expect(service.consume('uploads', 'u1')).rejects.toBeInstanceOf(HttpException);
    expect(multi.incr).toHaveBeenCalledWith('atalaya:demo:uploads:u1');
  });

  it('/api/demo anuncia los límites sin decir cuántas cuentas hay', async () => {
    const { service } = await build({ DEMO_MODE: 'true' });
    expect(service.info()).toEqual({
      enabled: true,
      accountHours: 24,
      limits: { files: 10, megabytes: 5, rows: 50_000, uploadsPerDay: 30, analysesPerDay: 20 },
    });
  });
});
