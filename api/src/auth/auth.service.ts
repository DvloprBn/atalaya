import { Injectable } from '@nestjs/common';
import { isExpired } from '../demo/account-expiry.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionCookies } from './cookies.js';
import { verifyPassword } from './passwords.js';
import { RateLimits } from './rate-limits.js';
import { SecurityLog } from '../security/security-log.service.js';
import { SecondFactorService } from './two-factor/second-factor.service.js';
import { SessionsService } from './sessions.service.js';

/** Lo que el frontend puede saber del usuario. Nunca el hash ni fechas internas. */
export interface PublicUser {
  id: string;
  email: string;
  role: { name: string; level: number };
  /** v1.0 · Demo: cuándo se borra la cuenta (la pantalla muestra el aviso y la cuenta regresiva). null = permanente. */
  expiresAt: Date | null;
}

/** Sesión iniciada, o — si la cuenta tiene 2FA — un reto: la contraseña ya se comprobó, falta el código. */
export type LoginResult = { tokens: SessionCookies; user: PublicUser } | { challenge: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimits,
    private readonly sessions: SessionsService,
    private readonly secondFactor: SecondFactorService,
    private readonly security: SecurityLog,
  ) {}

  /**
   * null = "correo o contraseña incorrectos", sin decir cuál: cuenta inexistente,
   * contraseña mala, cuenta desactivada o bloqueada por intentos se ven IGUAL.
   */
  async login(email: string, password: string, ip?: string): Promise<LoginResult | null> {
    // 1. Tope por cuenta ANTES de tocar la base (lección 63, regla 1). Aun bloqueada,
    //    se hace el mismo trabajo de Argon2 para que el tiempo no delate el bloqueo.
    if (await this.limits.isLoginLocked(email)) {
      await verifyPassword(null, password);
      // Un atacante que sigue golpeando una cuenta bloqueada no debe llenar la bitácora: una línea por minuto y origen.
      await this.security.record('login_locked', { ip, dedupe: true });
      return null;
    }

    // 2. Siempre se verifica una contraseña, exista o no la cuenta (mismo tiempo).
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, disabledAt: true, expiresAt: true, role: { select: { name: true, level: true } } },
    });
    const valid = await verifyPassword(user?.passwordHash, password);

    // Una cuenta de la demo vencida (y aún sin barrer) se ve igual que una desactivada.
    const blocked = user ? (user.disabledAt ? 'disabled' : isExpired(user) ? 'expired' : null) : null;
    if (!user || !valid || blocked) {
      await this.limits.recordLoginFailure(email);
      // El motivo real queda SOLO en la bitácora del admin; a quien intenta se le dice siempre lo mismo.
      await this.security.record('login_failed', { userId: user?.id, ip, detail: !user ? 'unknown_account' : (blocked ?? 'bad_password') });
      return null;
    }

    await this.limits.clearLoginFailures(email);
    // Con 2FA NO nace una sesión todavía: solo un reto de un solo uso. La sesión nace en /auth/2fa/verify.
    if (await this.secondFactor.isEnabled(user.id)) {
      return { challenge: await this.secondFactor.startChallenge(user.id) };
    }
    const tokens = await this.sessions.start(user.id);
    return { tokens, user: { id: user.id, email: user.email, role: user.role, expiresAt: user.expiresAt } };
  }
}
