import { BadRequestException, Injectable } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { invitation } from './emails.js';
import { hashPassword, passwordProblem } from './passwords.js';
import { newOpaqueToken, sha256 } from './tokens.js';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

// Cuando el admin crea una cuenta, la contraseña NO la pone el admin ni viaja por
// correo: la cuenta nace sin contraseña y la persona la elige con este enlace.
// Aceptarlo también prueba que lee ese buzón (lección 45: el personal nace verificado
// por su propio correo, no por la palabra de quien lo dio de alta).
@Injectable()
export class InvitationsService {
  private readonly origin = loadEnv().appOrigin;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Se llama DENTRO de la transacción que crea la cuenta: nacen juntas o ninguna. */
  async send(tx: Prisma.TransactionClient, user: { id: string; email: string }, roleName: string): Promise<void> {
    const token = newOpaqueToken();
    await tx.emailToken.create({
      data: {
        purpose: 'invite',
        email: user.email,
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await this.mail.enqueue(user.email, invitation(`${this.origin}/bienvenida?token=${token}`, roleName), tx);
  }

  /** false = enlace inválido, vencido, ya usado o cuenta desactivada (sin decir cuál). */
  async accept(token: string, password: string): Promise<boolean> {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.purpose !== 'invite' || !row.userId) return false;
    const problem = passwordProblem(password, row.email);
    if (problem) throw new BadRequestException(problem);
    const passwordHash = await hashPassword(password);
    const userId = row.userId;

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.emailToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      // Solo una cuenta activa que todavía no tiene contraseña: una invitación vieja no
      // sirve para cambiar la contraseña de una cuenta que ya está en uso.
      const updated = await tx.user.updateMany({
        where: { id: userId, passwordHash: null, disabledAt: null },
        data: { passwordHash, emailVerifiedAt: now },
      });
      return updated.count === 1;
    });
  }
}
