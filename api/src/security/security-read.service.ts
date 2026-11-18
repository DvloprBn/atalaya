import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SecurityEventType } from './security-log.service.js';

const PAGE_SIZE = 20;
const SUMMARY_DAYS = 14;

type UserRow = { id: string; email: string; role: { level: number } } | null;

/**
 * Lo que el panel del admin lee. La regla de la jerarquía (OWASP API1) también manda aquí: la
 * bitácora menciona cuentas, y un admin no debe enterarse por ella de los correos de quienes están
 * a su nivel o por encima (otros admins, el director, el super). Esos eventos SE VEN, pero sin la cuenta.
 */
@Injectable()
export class SecurityReadService {
  constructor(private readonly prisma: PrismaService) {}

  async events(actor: AuthUser, type: SecurityEventType | undefined, page = 1) {
    const where = type ? { type } : {};
    const [rows, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { user: { select: USER } },
      }),
      this.prisma.securityEvent.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      type: r.type,
      createdAt: r.createdAt,
      // Un prefijo basta para ver «mismo origen» y no sirve para nada más.
      source: r.ipHash ? r.ipHash.slice(0, 8) : null,
      detail: r.detail,
      user: visible(actor, r.user),
    }));
    return { items, page, pageSize: PAGE_SIZE, total };
  }

  async audit(actor: AuthUser, page = 1) {
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { actor: { select: USER }, target: { select: USER } },
      }),
      this.prisma.auditLog.count(),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      detail: r.detail,
      actor: visible(actor, r.actor),
      target: visible(actor, r.target),
    }));
    return { items, page, pageSize: PAGE_SIZE, total };
  }

  /** Un renglón por día (UTC), incluidos los días sin eventos, para dibujar el radar sin huecos. */
  async summary() {
    const rows = await this.prisma.$queryRaw<{ day: string; type: string; n: number }[]>`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, type, count(*)::int AS n
      FROM security_events
      WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${SUMMARY_DAYS - 1})) AT TIME ZONE 'UTC'
      GROUP BY 1, 2`;
    const days = Array.from({ length: SUMMARY_DAYS }, (_, i) => {
      const d = new Date(Date.now() - (SUMMARY_DAYS - 1 - i) * 86_400_000);
      return { date: d.toISOString().slice(0, 10), total: 0, byType: {} as Record<string, number> };
    });
    for (const row of rows) {
      const day = days.find((d) => d.date === row.day);
      if (!day) continue;
      day.byType[row.type] = row.n;
      day.total += row.n;
    }
    return { days };
  }
}

const USER = { id: true, email: true, role: { select: { level: true } } } as const;

/** El correo solo si la cuenta está estrictamente por debajo de quien mira, o es la suya. */
function visible(actor: AuthUser, user: UserRow): { email: string } | null {
  if (!user) return null;
  return user.id === actor.id || user.role.level < actor.role.level ? { email: user.email } : null;
}
