import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionCookies } from './cookies.js';
import { verifyPassword } from './passwords.js';
import { RateLimits } from './rate-limits.js';
import { SessionsService } from './sessions.service.js';

/** Lo que el frontend puede saber del usuario. Nunca el hash ni fechas internas. */
export interface PublicUser {
  id: string;
  email: string;
  role: { name: string; level: number };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimits,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * null = "correo o contraseña incorrectos", sin decir cuál: cuenta inexistente,
   * contraseña mala, cuenta desactivada o bloqueada por intentos se ven IGUAL.
   */
  async login(email: string, password: string): Promise<{ tokens: SessionCookies; user: PublicUser } | null> {
    // 1. Tope por cuenta ANTES de tocar la base (lección 63, regla 1). Aun bloqueada,
    //    se hace el mismo trabajo de Argon2 para que el tiempo no delate el bloqueo.
    if (await this.limits.isLoginLocked(email)) {
      await verifyPassword(null, password);
      return null;
    }

    // 2. Siempre se verifica una contraseña, exista o no la cuenta (mismo tiempo).
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, disabledAt: true, role: { select: { name: true, level: true } } },
    });
    const valid = await verifyPassword(user?.passwordHash, password);

    if (!user || !valid || user.disabledAt) {
      await this.limits.recordLoginFailure(email);
      return null;
    }

    await this.limits.clearLoginFailures(email);
    const tokens = await this.sessions.start(user.id);
    return { tokens, user: { id: user.id, email: user.email, role: user.role } };
  }
}
