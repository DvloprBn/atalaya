import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SessionCookies } from '../cookies.js';
import type { PublicUser } from '../auth.service.js';
import { RateLimits } from '../rate-limits.js';
import { SecurityLog } from '../../security/security-log.service.js';
import { SessionsService } from '../sessions.service.js';
import { Challenges } from './challenges.js';
import { hashRecoveryCode, normalizeRecoveryCode } from './recovery-codes.js';
import { SecretBox } from './secret-box.js';
import { verifyTotp } from './totp.js';

/**
 * El segundo factor al INICIAR SESIÓN y la comprobación de códigos que comparte todo lo demás.
 * (Activar, desactivar y regenerar códigos viven en two-factor.service.ts.)
 */
@Injectable()
export class SecondFactorService {
  private readonly log = new Logger(SecondFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBox,
    private readonly limits: RateLimits,
    private readonly challenges: Challenges,
    private readonly sessions: SessionsService,
    private readonly security: SecurityLog,
  ) {}

  /** ¿Esta cuenta tiene el 2FA CONFIRMADO? (Uno pendiente de confirmar no cuenta.) */
  async isEnabled(userId: string): Promise<boolean> {
    return (await this.prisma.twoFactor.count({ where: { userId, confirmedAt: { not: null } } })) > 0;
  }

  startChallenge(userId: string): Promise<string> {
    return this.challenges.create(userId);
  }

  /** Segundo paso del login. null = no (la API responde 401 sin decir por qué). */
  async verifyLogin(challenge: string, code: string, ip?: string): Promise<{ tokens: SessionCookies; user: PublicUser } | null> {
    const userId = await this.challenges.peek(challenge);
    if (!userId || (await this.limits.isTwoFactorLocked(userId))) return null;

    if (!(await this.checkCode(userId, code))) {
      await this.limits.recordTwoFactorFailure(userId);
      await this.challenges.recordFailure(challenge);
      await this.security.record('two_factor_failed', { userId, ip, detail: 'login' });
      return null;
    }
    // El código era bueno. Ahora se gasta el reto: si dos peticiones llegan a la vez
    // con el mismo reto, solo una lo gana (GETDEL atómico) y la otra recibe 401.
    if (!(await this.challenges.consume(challenge))) return null;
    await this.limits.clearTwoFactorFailures(userId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, disabledAt: null },
      select: { id: true, email: true, role: { select: { name: true, level: true } } },
    });
    if (!user) return null;
    return { tokens: await this.sessions.start(user.id), user };
  }

  /**
   * ¿Es `raw` un código válido de esta cuenta? Acepta un código de la app (6 dígitos) o uno de
   * recuperación. Si es válido lo GASTA (el paso del tiempo o el código), de forma atómica:
   * con dos peticiones simultáneas y el mismo código, solo una pasa.
   */
  async checkCode(userId: string, raw: string): Promise<boolean> {
    const code = raw.trim();
    if (/^\d{6}$/.test(code)) return this.checkTotp(userId, code);

    const canonical = normalizeRecoveryCode(code);
    if (!canonical) return false;
    const spent = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(canonical), usedAt: null },
      data: { usedAt: new Date() },
    });
    return spent.count === 1;
  }

  private async checkTotp(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.twoFactor.findFirst({ where: { userId, confirmedAt: { not: null } } });
    if (!row) return false;
    let step: number | null;
    try {
      step = verifyTotp(this.box.decrypt(row.secretEnc, userId), code);
    } catch {
      // Secreto ilegible (llave equivocada o dato alterado): nadie entra con él, y se avisa
      // al operador SIN datos de la cuenta.
      this.log.error('Un secreto TOTP no se pudo descifrar: ¿cambió TOTP_ENCRYPTION_KEY?');
      return false;
    }
    if (step === null) return false;
    // Anti-repetición (RFC 6238 §5.2): solo vale un paso MAYOR al último aceptado. El
    // UPDATE condicionado es atómico: dos peticiones con el mismo código, gana una.
    const claimed = await this.prisma.twoFactor.updateMany({
      where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: { lastUsedStep: step },
    });
    return claimed.count === 1;
  }
}
