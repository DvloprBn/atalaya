// S-10 · Recuperación asistida del 2FA: quien perdió el teléfono Y los códigos de recuperación no puede entrar, y solo
// un admin puede ayudarle. Decisión del dueño (2026-11-20): un admin lo pide, se aplica a las 48 h, y la persona recibe
// un correo para cancelarlo si no fue ella. La ESPERA es la defensa contra quien engañe al admin haciéndose pasar por ella.
//
// Aquí viven las tres transiciones de una solicitud. Cada una es un «compara y cambia» sobre la fila (solo si sigue
// pendiente): dos admins, o un admin y la persona, o dos instancias de la API a la vez, nunca ganan los dos.
// Quién puede PEDIRLA (jerarquía, reautenticación del admin) lo decide admin-users.service.ts.
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { MailService } from '../../mail/mail.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../security/audit.js';
import { twoFactorResetApplied, twoFactorResetCancelled, twoFactorResetRejectedByOwner, twoFactorResetRequested } from '../emails.js';
import { SessionsService } from '../sessions.service.js';
import { newOpaqueToken, sha256 } from '../tokens.js';

type Tx = Prisma.TransactionClient;
const pending = { cancelledAt: null, appliedAt: null } as const;

@Injectable()
export class TwoFactorResets implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('2FA');
  private readonly env = loadEnv();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
  ) {}

  onModuleInit() {
    // Cada minuto basta para 48 h; con la espera corta de las pruebas, se revisa más seguido.
    const every = Math.max(1_000, Math.min(60_000, (this.env.twoFactorResetDelayS * 1000) / 2));
    this.timer = setInterval(() => void this.applyDue(), every);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** ¿Hay una solicitud pendiente para esta cuenta? */
  findPending(tx: Tx, userId: string) {
    return tx.twoFactorReset.findFirst({ where: { userId, ...pending }, select: { id: true, effectiveAt: true } });
  }

  /** Crea la solicitud, el correo con el enlace de cancelación y la auditoría, en la transacción de quien la pide. */
  async create(tx: Tx, target: { id: string; email: string }, actorId: string, reason: string): Promise<Date> {
    const token = newOpaqueToken();
    const effectiveAt = new Date(Date.now() + this.env.twoFactorResetDelayS * 1000);
    await tx.twoFactorReset.create({
      data: { userId: target.id, requestedById: actorId, reason, cancelTokenHash: sha256(token), effectiveAt },
    });
    await this.mail.enqueue(target.email, twoFactorResetRequested(`${this.env.appOrigin}/cancelar-2fa?token=${token}`, effectiveAt, reason), tx);
    await writeAudit(tx, 'two_factor_reset_requested', actorId, target.id, `aplica=${effectiveAt.toISOString()}`);
    return effectiveAt;
  }

  /** Un admin cancela la pendiente de esta cuenta. false = no había ninguna. */
  async cancelByAdmin(tx: Tx, userId: string, actorId: string, targetEmail: string): Promise<boolean> {
    const done = await tx.twoFactorReset.updateMany({ where: { userId, ...pending }, data: { cancelledAt: new Date() } });
    if (done.count !== 1) return false;
    await writeAudit(tx, 'two_factor_reset_cancelled', actorId, userId, 'por un admin');
    await this.mail.enqueue(targetEmail, twoFactorResetCancelled(), tx);
    return true;
  }

  /**
   * La persona cancela con el enlace de su correo. Hacia fuera siempre termina igual (la ruta responde lo mismo con un
   * enlace inválido, usado, aplicado o ya cancelado). Se avisa al admin que la pidió: es la señal de una suplantación.
   */
  async cancelByToken(token: string): Promise<void> {
    const row = await this.prisma.twoFactorReset.findUnique({
      where: { cancelTokenHash: sha256(token) },
      select: { id: true, userId: true, user: { select: { email: true } }, requestedBy: { select: { email: true } } },
    });
    if (!row) return;
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.twoFactorReset.updateMany({ where: { id: row.id, ...pending }, data: { cancelledAt: new Date() } });
      if (done.count !== 1) return;
      await writeAudit(tx, 'two_factor_reset_cancelled', row.userId, row.userId, 'por su dueño');
      await this.mail.enqueue(row.user.email, twoFactorResetCancelled(), tx);
      if (row.requestedBy) await this.mail.enqueue(row.requestedBy.email, twoFactorResetRejectedByOwner(row.user.email), tx);
    });
  }

  /**
   * La persona demostró tener su factor (entró con un código, o activó/desactivó su 2FA): una solicitud pendiente ya no
   * tiene razón de ser, y si la pidió alguien haciéndose pasar por ella, aquí se cae SOLA aunque nunca abra el correo.
   * Seguro: quien ya tiene el código no necesita el restablecimiento. Se avisa al admin que la pidió.
   */
  async ownerProvedFactor(userId: string): Promise<void> {
    const row = await this.prisma.twoFactorReset.findFirst({
      where: { userId, ...pending },
      select: { id: true, user: { select: { email: true } }, requestedBy: { select: { email: true } } },
    });
    if (!row) return;
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.twoFactorReset.updateMany({ where: { id: row.id, ...pending }, data: { cancelledAt: new Date() } });
      if (done.count !== 1) return;
      await writeAudit(tx, 'two_factor_reset_cancelled', userId, userId, 'su dueño usó su 2FA');
      await this.mail.enqueue(row.user.email, twoFactorResetCancelled(), tx);
      if (row.requestedBy) await this.mail.enqueue(row.requestedBy.email, twoFactorResetRejectedByOwner(row.user.email), tx);
    });
  }

  /** Aplica las vencidas: quita el 2FA y los códigos y cierra TODAS las sesiones, igual que desactivarlo uno mismo. */
  async applyDue(now = new Date()): Promise<number> {
    let applied = 0;
    try {
      const due = await this.prisma.twoFactorReset.findMany({
        where: { effectiveAt: { lte: now }, ...pending },
        select: { id: true, userId: true, user: { select: { email: true } } },
        orderBy: { effectiveAt: 'asc' },
        take: 50,
      });
      for (const row of due) {
        await this.prisma.$transaction(async (tx) => {
          // Se reclama la fila: si otra instancia (o una cancelación de último segundo) llegó antes, no se hace nada.
          const claimed = await tx.twoFactorReset.updateMany({ where: { id: row.id, ...pending }, data: { appliedAt: new Date() } });
          if (claimed.count !== 1) return;
          await tx.recoveryCode.deleteMany({ where: { userId: row.userId } });
          await tx.twoFactor.deleteMany({ where: { userId: row.userId } });
          await this.sessions.revokeAllForUser(row.userId, 'two_factor_changed', tx);
          await writeAudit(tx, 'two_factor_reset_applied', null, row.userId);
          await this.mail.enqueue(row.user.email, twoFactorResetApplied(`${this.env.appOrigin}/login`), tx);
          applied++;
        });
      }
    } catch {
      // Sin datos de la cuenta en el log. La próxima vuelta lo reintenta: nada quedó a medias (todo va en transacción).
      this.log.error('No se pudieron aplicar los restablecimientos de 2FA vencidos; se reintenta en la próxima vuelta.');
    }
    return applied;
  }
}
