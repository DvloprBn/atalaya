import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { InvitationsService } from '../auth/invitations.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canAssign, canManage, manageableLevels } from './hierarchy.js';

const PAGE_SIZE = 20;
type Tx = Prisma.TransactionClient;

/** Lo que el admin ve de una cuenta. Nunca el hash ni datos de sesiones. */
export interface AdminUser {
  id: string;
  email: string;
  role: { name: string; level: number };
  status: 'active' | 'invited' | 'disabled';
  createdAt: Date;
}

const SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  disabledAt: true,
  createdAt: true,
  role: { select: { name: true, level: true } },
} as const;

// REGLAS (ver hierarchy.ts): solo se ve y se toca lo que está estrictamente por debajo.
// Lo que está por encima responde 404, no 403: ni siquiera se confirma que existe (OWASP API1).
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly sessions: SessionsService,
  ) {}

  roles(actor: AuthUser) {
    return this.prisma.role.findMany({
      where: { level: manageableLevels(actor.role.level) },
      orderBy: { level: 'asc' },
      select: { name: true, level: true, maxCount: true },
    });
  }

  async list(actor: AuthUser, q = '', page = 1) {
    const where = { role: { level: manageableLevels(actor.role.level) }, email: { contains: q.trim().toLowerCase() } };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toAdminUser), page, pageSize: PAGE_SIZE, total };
  }

  async get(actor: AuthUser, id: string): Promise<AdminUser> {
    const user = await this.prisma.user.findFirst({ where: { id, role: { level: manageableLevels(actor.role.level) } }, select: SELECT });
    if (!user) throw new NotFoundException();
    return toAdminUser(user);
  }

  /** Crea la cuenta sin contraseña y le manda la invitación, todo en una transacción. */
  async create(actor: AuthUser, email: string, roleName: string): Promise<AdminUser> {
    const role = await this.assignableRole(actor, roleName);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.ensureCapacity(tx, role);
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      const user = await tx.user.create({ data: { email, roleId: role.id }, select: { id: true, email: true } });
      await this.invitations.send(tx, user, role.name);
      return user.id;
    });
    return this.get(actor, id);
  }

  async changeRole(actor: AuthUser, id: string, roleName: string): Promise<AdminUser> {
    const role = await this.assignableRole(actor, roleName);
    await this.prisma.$transaction(async (tx) => {
      const target = await this.lockTarget(tx, actor, id);
      if (!canAssign(actor.role.level, target.level, role.level)) throw new ForbiddenException();
      if (target.roleId !== role.id) await this.ensureCapacity(tx, role);
      await tx.user.update({ where: { id }, data: { roleId: role.id } });
    });
    return this.get(actor, id);
  }

  async setDisabled(actor: AuthUser, id: string, disabled: boolean): Promise<AdminUser> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.lockTarget(tx, actor, id);
      if (disabled) {
        await tx.user.update({ where: { id }, data: { disabledAt: new Date() } });
        // Sus sesiones se cierran AHORA y para siempre: al reactivarla, ninguna revive.
        await this.sessions.revokeAllForUser(id, 'account_disabled', tx);
      } else {
        // Reactivar cuenta contra el tope (p. ej. ya hay otro director activo).
        const role = await tx.role.findUniqueOrThrow({ where: { id: target.roleId } });
        if (target.disabled) await this.ensureCapacity(tx, role);
        await tx.user.update({ where: { id }, data: { disabledAt: null } });
      }
    });
    return this.get(actor, id);
  }

  /** El rol existe y está por debajo de quien lo asigna. Si no: 403. */
  private async assignableRole(actor: AuthUser, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role || !canManage(actor.role.level, role.level)) throw new ForbiddenException('No puedes asignar ese rol');
    return role;
  }

  /**
   * Bloquea la fila de la cuenta (FOR UPDATE) y revisa la jerarquía con el dato bloqueado:
   * si dos admins actúan a la vez sobre ella, el segundo espera y ve lo que hizo el primero.
   */
  private async lockTarget(tx: Tx, actor: AuthUser, id: string) {
    const [row] = await tx.$queryRaw<{ level: number; roleId: number; disabled: boolean }[]>`
      SELECT r.level, u.role_id AS "roleId", u.disabled_at IS NOT NULL AS disabled
      FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ${id}::uuid
      FOR UPDATE OF u`;
    if (!row || !canManage(actor.role.level, row.level)) throw new NotFoundException();
    return row;
  }

  /**
   * Tope de cuentas activas por rol (1 director, 1 super). Bloquear la fila del rol
   * pone en fila a todas las asignaciones a ese rol: dos a la vez no pueden pasar
   * las dos el conteo (sin el candado, ambas verían "0" y entrarían).
   */
  private async ensureCapacity(tx: Tx, role: { id: number; maxCount: number | null }): Promise<void> {
    if (role.maxCount === null) return;
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${role.id} FOR UPDATE`;
    const active = await tx.user.count({ where: { roleId: role.id, disabledAt: null } });
    if (active >= role.maxCount) throw new ConflictException('Ya está ocupado el máximo de cuentas con ese rol');
  }
}

function toAdminUser(u: { id: string; email: string; passwordHash: string | null; disabledAt: Date | null; createdAt: Date; role: { name: string; level: number } }): AdminUser {
  const status = u.disabledAt ? 'disabled' : u.passwordHash ? 'active' : 'invited';
  return { id: u.id, email: u.email, role: u.role, status, createdAt: u.createdAt };
}
