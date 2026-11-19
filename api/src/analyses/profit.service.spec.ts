import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.decorator.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ProfitService } from './profit.service.js';

const USER = { id: 'u1', email: 'ana@example.com', role: { name: 'usuario', level: 0 }, sessionId: 's1' } as AuthUser;
const monthly = (...points: [string, string][]) => ({ monthly: points.map(([month, amount]) => ({ month, amount, rows: 1, changePercent: null })) });
const analysis = (id: string, kind: string, over: Record<string, unknown> = {}) => ({
  id, ownerId: 'u1', kind, status: 'done', insights: monthly(['2026-01', '0.00']), ...over,
});

function build(rows: Record<string, unknown>) {
  const prisma = { analysis: { findFirst: vi.fn(async ({ where }: { where: { id: string; ownerId: string } }) => (where.ownerId === 'u1' ? (rows[where.id] ?? null) : null)) } };
  return { service: new ProfitService(prisma as unknown as PrismaService), prisma };
}
const SALES = analysis('s', 'sales', { insights: monthly(['2026-01', '1000.10'], ['2026-02', '500.00']) });
const EXPENSES = analysis('e', 'expenses', { insights: monthly(['2026-01', '300.20'], ['2026-03', '80.00']) });

describe('ProfitService', () => {
  it('resta mes por mes; un mes que solo está en una serie cuenta 0.00 en la otra', async () => {
    const { service } = build({ s: SALES, e: EXPENSES });
    expect(await service.profit(USER, 's', 'e')).toEqual({
      months: [
        { month: '2026-01', sales: '1000.10', expenses: '300.20', result: '699.90' },
        { month: '2026-02', sales: '500.00', expenses: '0.00', result: '500.00' },
        { month: '2026-03', sales: '0.00', expenses: '80.00', result: '-80.00' }, // un mes de pérdida
      ],
      salesTotal: '1500.10',
      expensesTotal: '380.20',
      resultTotal: '1119.90',
    });
  });

  it('el dinero es exacto: 0.10 + 0.20 de ventas contra 0.30 de gastos da un resultado de 0.00', async () => {
    const sales = analysis('s', 'sales', { insights: monthly(['2026-01', '0.10'], ['2026-02', '0.20']) });
    const expenses = analysis('e', 'expenses', { insights: monthly(['2026-01', '0.30']) });
    const out = await build({ s: sales, e: expenses }).service.profit(USER, 's', 'e');
    expect(out.salesTotal).toBe('0.30');
    expect(out.resultTotal).toBe('0.00'); // con Number: 0.30000000000000004 - 0.3 = 5.5e-17
  });

  it('los meses salen en orden aunque lleguen desordenados', async () => {
    const sales = analysis('s', 'sales', { insights: monthly(['2026-03', '1.00'], ['2025-12', '1.00'], ['2026-01', '1.00']) });
    const out = await build({ s: sales, e: analysis('e', 'expenses', { insights: monthly() }) }).service.profit(USER, 's', 'e');
    expect(out.months.map((m) => m.month)).toEqual(['2025-12', '2026-01', '2026-03']);
  });

  it('lo ajeno y lo inexistente dan el MISMO 404, sin decir cuál de los dos falló', async () => {
    const mine = build({ s: SALES, e: EXPENSES });
    await expect(mine.service.profit(USER, 's', 'no-existe')).rejects.toThrow(NotFoundException);
    await expect(mine.service.profit(USER, 'no-existe', 'e')).rejects.toThrow(NotFoundException);
    const stranger = { ...USER, id: 'otro' } as AuthUser; // el filtro por dueño va en la consulta
    await expect(mine.service.profit(stranger, 's', 'e')).rejects.toThrow(NotFoundException);
    expect(mine.prisma.analysis.findFirst.mock.calls.every((c) => 'ownerId' in c[0].where)).toBe(true);
  });

  it('exige un análisis de ventas y uno de gastos, no al revés ni dos del mismo tipo (400)', async () => {
    const { service } = build({ s: SALES, e: EXPENSES, s2: analysis('s2', 'sales'), e2: analysis('e2', 'expenses') });
    await expect(service.profit(USER, 'e', 's')).rejects.toThrow(BadRequestException); // al revés
    await expect(service.profit(USER, 's', 's2')).rejects.toThrow(BadRequestException); // dos de ventas
    await expect(service.profit(USER, 'e2', 'e')).rejects.toThrow(BadRequestException); // dos de gastos
    await expect(service.profit(USER, 's', 's')).rejects.toThrow(BadRequestException); // el mismo dos veces
  });

  it.each(['previewing', 'awaiting_mapping', 'queued', 'running', 'failed'])('un análisis en estado %s da 409', async (status) => {
    await expect(build({ s: SALES, e: analysis('e', 'expenses', { status }) }).service.profit(USER, 's', 'e')).rejects.toThrow(ConflictException);
    await expect(build({ s: analysis('s', 'sales', { status }), e: EXPENSES }).service.profit(USER, 's', 'e')).rejects.toThrow(ConflictException);
  });

  it('un análisis terminado en v0.9 (sin indicadores) da 409 con un mensaje que dice qué hacer', async () => {
    const old = analysis('s', 'sales', { insights: null });
    await expect(build({ s: old, e: EXPENSES }).service.profit(USER, 's', 'e')).rejects.toThrow(/vuelve a crearlo/);
  });

  it('indicadores con una forma inesperada son un fallo NUESTRO (500), no un resultado con basura', async () => {
    for (const insights of [{}, { monthly: 'x' }, monthly(['2026-01', '1.5']), monthly(['2026-01', 'NaN'])]) {
      const bad = analysis('s', 'sales', { insights });
      await expect(build({ s: bad, e: EXPENSES }).service.profit(USER, 's', 'e')).rejects.toThrow('Indicadores inválidos');
    }
  });
});
