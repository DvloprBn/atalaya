import type { ResultsStorage } from '../analyses/results-storage.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UploadStorage } from '../uploads/upload-storage.js';

const BASE = {
  DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x', JWT_SECRET: 'x'.repeat(32), APP_ORIGIN: 'http://localhost:3070',
  SMTP_URL: 'smtp://x:1025', MAIL_FROM: 'x@example.com', TOTP_ENCRYPTION_KEY: 'ab'.repeat(32), DEMO_MODE: 'true',
};
const NOW = new Date('2026-11-21T12:00:00Z');

async function build(opts: { expired?: string[]; checking?: number; gone?: number } = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  const { DemoSweeper } = await import('./demo-sweeper.js');
  const order: string[] = [];
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue((opts.expired ?? ['u1']).map((id) => ({ id }))),
      deleteMany: vi.fn(async () => (order.push('fila'), { count: opts.gone ?? 1 })),
    },
    upload: {
      updateMany: vi.fn().mockResolvedValue({ count: opts.checking ?? 0 }),
      findMany: vi.fn().mockResolvedValue([{ storageKey: 'k1' }, { storageKey: 'k2' }]),
    },
    analysis: { findMany: vi.fn().mockResolvedValue([{ resultKey: 'r1' }]) },
  };
  const uploads = { remove: vi.fn(async () => void order.push('archivo')) };
  const results = { removeAll: vi.fn(async () => void order.push('resultado')) };
  const sweeper = new DemoSweeper(prisma as unknown as PrismaService, uploads as unknown as UploadStorage, results as unknown as ResultsStorage);
  return { sweeper, prisma, uploads, results, order };
}

afterEach(() => vi.unstubAllEnvs());

describe('DemoSweeper (borrado en cascada de las cuentas vencidas)', () => {
  it('borra los bytes del disco ANTES que la fila (si se cae a la mitad, la fila sigue y se reintenta)', async () => {
    const { sweeper, order, uploads, results } = await build();
    expect(await sweeper.sweep(NOW)).toBe(1);
    expect(order).toEqual(['archivo', 'archivo', 'resultado', 'fila']);
    expect(uploads.remove).toHaveBeenCalledWith('k1');
    expect(results.removeAll).toHaveBeenCalledWith('r1');
  });

  it('solo busca cuentas con fecha de borrado ya pasada; las permanentes (null) nunca entran', async () => {
    const { sweeper, prisma } = await build();
    await sweeper.sweep(NOW);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { expiresAt: { lte: NOW } } }));
    // Y la fila se borra condicionada a «sigue vencida», en la misma sentencia.
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: 'u1', expiresAt: { lte: NOW } } });
  });

  it('si el worker revisa un archivo de esa cuenta, lo marca y la deja para la próxima vuelta', async () => {
    const { sweeper, prisma, order } = await build({ checking: 1 });
    expect(await sweeper.sweep(NOW)).toBe(0);
    expect(prisma.upload.updateMany).toHaveBeenCalledWith({ where: { ownerId: 'u1', status: 'checking' }, data: { deleteRequestedAt: NOW } });
    expect(order).toEqual([]);
  });

  it('dos instancias a la vez: la que llega tarde no cuenta un borrado que no hizo', async () => {
    const { sweeper } = await build({ gone: 0 });
    expect(await sweeper.sweep(NOW)).toBe(0);
  });

  it('un fallo no tumba la API: se anota sin datos de cuentas y se reintenta en la próxima vuelta', async () => {
    const { sweeper, prisma } = await build();
    prisma.user.findMany.mockRejectedValueOnce(new Error('base caída'));
    await expect(sweeper.sweep(NOW)).resolves.toBe(0);
  });
});
