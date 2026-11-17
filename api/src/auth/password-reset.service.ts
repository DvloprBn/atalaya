import { BadRequestException, Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { noAccountForReset, resetPassword } from './emails.js';
import { hashPassword, passwordContainsEmail } from './passwords.js';
import { RateLimits } from './rate-limits.js';
import { SessionsService } from './sessions.service.js';
import { newOpaqueToken, sha256 } from './tokens.js';

const LINK_TTL_MS = 60 * 60 * 1000; // 1 hora: un enlace que cambia la contraseña vive poco

@Injectable()
export class PasswordResetService {
  private readonly origin = loadEnv().appOrigin;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly limits: RateLimits,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Pedir el enlace. Exista o no la cuenta, se escribe un correo en la bandeja
   * y la respuesta es idéntica: ni el texto ni el tiempo dicen si hay cuenta.
   */
  async request(email: string): Promise<void> {
    if (!(await this.limits.allowMailTo(email, 'password_reset'))) return;
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, disabledAt: true } });
    if (!user || user.disabledAt) {
      await this.mail.enqueue(email, noAccountForReset(`${this.origin}/registro`));
      return;
    }
    const token = newOpaqueToken();
    await this.prisma.emailToken.create({
      data: {
        purpose: 'password_reset',
        email,
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
      },
    });
    await this.mail.enqueue(email, resetPassword(`${this.origin}/restablecer?token=${token}`));
  }

  /** Usar el enlace. false = inválido, vencido o ya usado. */
  async reset(token: string, newPassword: string): Promise<boolean> {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.purpose !== 'password_reset' || !row.userId) return false;
    if (passwordContainsEmail(newPassword, row.email)) {
      throw new BadRequestException('La contraseña no puede contener tu correo');
    }
    const passwordHash = await hashPassword(newPassword); // fuera de la transacción: tarda

    const userId = row.userId;
    const done = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.emailToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Quien tuviera la contraseña vieja (y su sesión) queda fuera AL INSTANTE: el
      // guard revisa la sesión en cada petición, no solo al renovar.
      await this.sessions.revokeAllForUser(userId, 'password_reset', tx);
      await tx.emailToken.updateMany({
        where: { userId, purpose: 'password_reset', usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });
    if (done) await this.limits.clearLoginFailures(row.email);
    return done;
  }
}
