import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { loadEnv } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { alreadyRegistered, verifyEmail } from './emails.js';
import { hashPassword, passwordContainsEmail } from './passwords.js';
import { RateLimits } from './rate-limits.js';
import { newOpaqueToken, sha256 } from './tokens.js';

const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ROLE_ID = 1; // 'usuario': fila fija sembrada por la migración

// DISEÑO: registrarse NO crea al usuario. Crea un enlace pendiente que guarda la
// contraseña elegida (ya en hash); el usuario nace al abrir ese enlace. Así:
// - no existen cuentas "sin verificar" que alguien pueda registrar antes que su
//   dueño (ataque de pre-secuestro de cuenta, lecciones 45 y 61);
// - registrar correos ajenos en masa no llena la tabla de usuarios.
@Injectable()
export class RegistrationService {
  private readonly origin = loadEnv().appOrigin;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly limits: RateLimits,
  ) {}

  /** Siempre termina igual hacia fuera; lo que pasó se le cuenta al dueño del correo, por correo. */
  async register(email: string, password: string): Promise<void> {
    if (passwordContainsEmail(password, email)) {
      throw new BadRequestException('La contraseña no puede contener tu correo');
    }
    // El hash se calcula SIEMPRE, exista o no la cuenta: mismo trabajo, mismo tiempo.
    const passwordHash = await hashPassword(password);
    if (!(await this.limits.allowMailTo(email, 'register'))) return; // tope por destinatario, en silencio

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      await this.mail.enqueue(email, alreadyRegistered(`${this.origin}/login`, `${this.origin}/olvide`));
      return;
    }
    const token = newOpaqueToken();
    await this.prisma.emailToken.create({
      data: {
        purpose: 'register',
        email,
        passwordHash,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
      },
    });
    await this.mail.enqueue(email, verifyEmail(`${this.origin}/verificar?token=${token}`));
  }

  /** Abre un enlace de registro. false = inválido, vencido o ya usado (sin decir cuál). */
  async verify(token: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const row = await tx.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
        if (!row || row.purpose !== 'register' || !row.passwordHash) return false;

        // Consumo atómico: dos clics simultáneos en el mismo enlace, solo uno gana.
        const claimed = await tx.emailToken.updateMany({
          where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) return false;

        const exists = await tx.user.findUnique({ where: { email: row.email }, select: { id: true } });
        if (!exists) {
          await tx.user.create({
            data: { email: row.email, passwordHash: row.passwordHash, emailVerifiedAt: now, roleId: DEFAULT_ROLE_ID },
          });
        }
        // Los demás enlaces de registro de este correo dejan de servir.
        await tx.emailToken.updateMany({
          where: { email: row.email, purpose: 'register', usedAt: null },
          data: { usedAt: now },
        });
        return true;
      });
    } catch (error) {
      // Dos enlaces DISTINTOS del mismo correo abiertos a la vez: el segundo choca con el
      // índice único de users.email. La cuenta ya existe, así que el resultado es el mismo.
      // (Se atrapa FUERA de la transacción: dentro, Postgres ya la dio por abortada, lección 20.)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return true;
      throw error;
    }
  }
}
