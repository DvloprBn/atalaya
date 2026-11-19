import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromCents, toCents } from './money.js';

interface MonthPoint {
  month: string;
  amount: string;
}

/** Resultado = ventas − gastos, mes por mes, de dos análisis míos ya terminados. */
@Injectable()
export class ProfitService {
  private readonly log = new Logger(ProfitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async profit(user: AuthUser, salesId: string, expensesId: string) {
    // Los dos, filtrados por dueño EN LA CONSULTA: ajeno e inexistente dan el mismo 404, y no se dice cuál de los dos falló.
    const [sales, expenses] = await Promise.all(
      [salesId, expensesId].map((id) => this.prisma.analysis.findFirst({ where: { id, ownerId: user.id } })),
    );
    if (!sales || !expenses) throw new NotFoundException();
    if (sales.kind !== 'sales') throw new BadRequestException('«sales» debe ser un análisis de ventas');
    if (expenses.kind !== 'expenses') throw new BadRequestException('«expenses» debe ser un análisis de gastos');
    for (const analysis of [sales, expenses]) {
      if (analysis.status !== 'done') throw new ConflictException('Los dos análisis deben estar terminados');
      if (!analysis.insights) {
        throw new ConflictException('Uno de los análisis es anterior a los indicadores: vuelve a crearlo');
      }
    }

    const salesByMonth = this.series(sales.insights);
    const expensesByMonth = this.series(expenses.insights);
    const months = [...new Set([...salesByMonth.keys(), ...expensesByMonth.keys()])].sort(); // «AAAA-MM» ordena bien como texto

    let salesTotal = 0n;
    let expensesTotal = 0n;
    const rows = months.map((month) => {
      const s = salesByMonth.get(month) ?? 0n; // un mes que solo está en una serie cuenta 0.00 en la otra
      const e = expensesByMonth.get(month) ?? 0n;
      salesTotal += s;
      expensesTotal += e;
      return { month, sales: fromCents(s), expenses: fromCents(e), result: fromCents(s - e) };
    });
    return {
      months: rows,
      salesTotal: fromCents(salesTotal),
      expensesTotal: fromCents(expensesTotal),
      resultTotal: fromCents(salesTotal - expensesTotal),
    };
  }

  /** La serie mensual de los indicadores, en centavos. Si el JSON no tiene la forma del contrato es un fallo NUESTRO (500). */
  private series(insights: unknown): Map<string, bigint> {
    try {
      const monthly = (insights as { monthly: MonthPoint[] }).monthly;
      return new Map(monthly.map((point) => [point.month, toCents(point.amount)]));
    } catch {
      this.log.error('Indicadores con una forma inesperada');
      throw new Error('Indicadores inválidos');
    }
  }
}
