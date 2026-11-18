import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { AnalysesService, MAX_ANALYSES_PER_ACCOUNT } from './analyses.service.js';
import type { ResultsStorage } from './results-storage.js';

const USER = { id: 'u1', email: 'ana@example.com', role: { name: 'usuario', level: 0 }, sessionId: 's1' } as AuthUser;
const KEY = 'a'.repeat(32);
const NOW = new Date('2026-11-18T12:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({
  id: 'an1', ownerId: 'u1', uploadId: 'up1', status: 'awaiting_mapping', failReason: null,
  preview: { columns: [{}, {}, {}, {}] }, mapping: null, report: null, resultKey: KEY, createdAt: NOW, updatedAt: NOW, ...over,
});

function build(opts: { upload?: unknown; count?: number; analysis?: unknown; moved?: number; redisFails?: boolean; createError?: Error } = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    analysis: {
      count: vi.fn().mockResolvedValue(opts.count ?? 0),
      create: vi.fn(async (_args: { data: Record<string, unknown> }) => { if (opts.createError) throw opts.createError; return row({ status: 'previewing', preview: null }); }),
    },
  };
  const prisma = {
    upload: { findFirst: vi.fn().mockResolvedValue('upload' in opts ? opts.upload : { id: 'up1', status: 'accepted' }) },
    analysis: {
      findFirst: vi.fn().mockResolvedValue('analysis' in opts ? opts.analysis : row()),
      findMany: vi.fn(), count: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: opts.moved ?? 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const redis = { client: { xadd: vi.fn(async () => { if (opts.redisFails) throw new Error('redis caído'); return '1-0'; }) } };
  const results = { removeAll: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue({ stream: {}, size: 3 }) };
  const service = new AnalysesService(prisma as unknown as PrismaService, redis as unknown as RedisService, results as unknown as ResultsStorage);
  return { service, prisma, tx, redis, results };
}

describe('AnalysesService.create', () => {
  it('crea el análisis, pone la llave de resultados y encola SOLO el id', async () => {
    const { service, tx, redis } = build();
    const out = await service.create(USER, 'up1');
    expect(out.status).toBe('previewing');
    expect(tx.$executeRaw).toHaveBeenCalled(); // el candado por cuenta
    const data = tx.analysis.create.mock.calls[0][0].data;
    expect(data.ownerId).toBe('u1');
    expect(data.resultKey).toMatch(/^[0-9a-f]{32}$/);
    expect(redis.client.xadd).toHaveBeenCalledWith('atalaya:analyses', 'MAXLEN', '~', 10_000, '*', 'id', 'an1');
    expect(Object.keys(out)).not.toContain('resultKey');
    expect(Object.keys(out)).not.toContain('ownerId');
  });

  it('un archivo ajeno o inexistente es 404 (el filtro por dueño va en la consulta)', async () => {
    const { service, prisma } = build({ upload: null });
    await expect(service.create(USER, 'ajeno')).rejects.toThrow(NotFoundException);
    expect(prisma.upload.findFirst.mock.calls[0][0].where).toMatchObject({ ownerId: 'u1' });
  });

  it.each(['queued', 'checking', 'rejected'])('un archivo %s no se puede analizar (409)', async (status) => {
    const { service } = build({ upload: { id: 'up1', status } });
    await expect(service.create(USER, 'up1')).rejects.toThrow(ConflictException);
  });

  it('con 10 análisis ya hechos da 409 y no crea nada', async () => {
    const { service, tx } = build({ count: MAX_ANALYSES_PER_ACCOUNT });
    await expect(service.create(USER, 'up1')).rejects.toThrow(ConflictException);
    expect(tx.analysis.create).not.toHaveBeenCalled();
  });

  it('si el archivo se borra a media operación (llave foránea), es 404 y no un 500', async () => {
    const fk = new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'x' });
    await expect(build({ createError: fk }).service.create(USER, 'up1')).rejects.toThrow(NotFoundException);
  });

  it('si no se puede encolar, se deshace la fila y da 503', async () => {
    const { service, prisma } = build({ redisFails: true });
    await expect(service.create(USER, 'up1')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.analysis.delete).toHaveBeenCalledWith({ where: { id: 'an1' } });
  });
});

describe('AnalysesService.putMapping', () => {
  const mapping = { date: 0, amount: 3 };

  it('guarda el mapeo normalizado, pasa a «queued» y encola', async () => {
    const { service, prisma, redis } = build();
    await service.putMapping(USER, 'an1', mapping);
    expect(prisma.analysis.updateMany).toHaveBeenCalledWith({
      where: { id: 'an1', ownerId: 'u1', status: 'awaiting_mapping' }, // condicionado al estado Y al dueño
      data: { mapping: { date: 0, amount: 3, dateOrder: 'auto', decimalSeparator: 'auto' }, status: 'queued' },
    });
    expect(redis.client.xadd).toHaveBeenCalled();
  });

  it('ajeno o inexistente: 404', async () => {
    await expect(build({ analysis: null }).service.putMapping(USER, 'x', mapping)).rejects.toThrow(NotFoundException);
  });

  it.each(['previewing', 'queued', 'running', 'done', 'failed'])('en estado %s no se acepta un mapeo (409)', async (status) => {
    const { service, prisma } = build({ analysis: row({ status }) });
    await expect(service.putMapping(USER, 'an1', mapping)).rejects.toThrow(ConflictException);
    expect(prisma.analysis.updateMany).not.toHaveBeenCalled();
  });

  it('una columna fuera de la vista previa, o repetida, da 400 y no cambia nada', async () => {
    const { service, prisma } = build(); // la vista previa tiene 4 columnas
    await expect(service.putMapping(USER, 'an1', { date: 0, amount: 4 })).rejects.toThrow(/no existe/);
    await expect(service.putMapping(USER, 'an1', { date: 1, amount: 1 })).rejects.toThrow(/misma columna/);
    expect(prisma.analysis.updateMany).not.toHaveBeenCalled();
  });

  it('dos confirmaciones a la vez: la que pierde la carrera recibe 409 y NO encola', async () => {
    const { service, redis } = build({ moved: 0 });
    await expect(service.putMapping(USER, 'an1', mapping)).rejects.toThrow(ConflictException);
    expect(redis.client.xadd).not.toHaveBeenCalled();
  });

  it('si no se puede encolar, vuelve a «awaiting_mapping» sin mapeo y da 503', async () => {
    const { service, prisma } = build({ redisFails: true });
    await expect(service.putMapping(USER, 'an1', mapping)).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.analysis.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'an1' }, data: { mapping: Prisma.DbNull, status: 'awaiting_mapping' },
    });
  });
});

describe('AnalysesService.exportFile y remove', () => {
  it.each(['previewing', 'awaiting_mapping', 'queued', 'running', 'failed'])('exportar en estado %s da 409', async (status) => {
    await expect(build({ analysis: row({ status }) }).service.exportFile(USER, 'an1', 'clean')).rejects.toThrow(ConflictException);
  });

  it('terminado: entrega el archivo; si ya no está en disco, 404', async () => {
    const ok = build({ analysis: row({ status: 'done', report: {} }) });
    expect(await ok.service.exportFile(USER, 'an1', 'report')).toMatchObject({ size: 3 });
    expect(ok.results.open).toHaveBeenCalledWith(KEY, 'report');
    const gone = build({ analysis: row({ status: 'done', report: {} }) });
    gone.results.open.mockResolvedValue(null);
    await expect(gone.service.exportFile(USER, 'an1', 'clean')).rejects.toThrow(NotFoundException);
  });

  it('borrar quita la fila (solo si es del dueño) y los dos CSV; ajeno es 404 y no borra nada', async () => {
    const { service, prisma, results } = build();
    expect(await service.remove(USER, 'an1')).toEqual({ message: 'Análisis borrado' });
    expect(prisma.analysis.deleteMany).toHaveBeenCalledWith({ where: { id: 'an1', ownerId: 'u1' } });
    expect(results.removeAll).toHaveBeenCalledWith(KEY);
    const other = build({ analysis: null });
    await expect(other.service.remove(USER, 'x')).rejects.toThrow(NotFoundException);
    expect(other.results.removeAll).not.toHaveBeenCalled();
  });
});
