import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionCookies } from './cookies.js';
import { newOpaqueToken, sha256 } from './tokens.js';

// Dos tokens (ver docs/GUIA_RECORRIDO.md, capítulo v0.2):
// - ACCESO: JWT de 10 minutos. Viaja en cada petición. Dice quién eres y en qué sesión.
// - REFRESH: token opaco que sirve UNA vez para pedir un acceso nuevo. Se rota en cada uso.
const ACCESS_TTL_S = 10 * 60;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // vida absoluta de una sesión
const REUSE_GRACE_MS = 10_000;

export type RevokeReason = 'logout' | 'password_reset' | 'reuse_detected' | 'account_disabled' | 'two_factor_changed';

export interface AccessClaims {
  sub: string; // id del usuario
  sid: string; // id de la sesión
  typ: 'access';
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Inicia sesión: crea la sesión y su primer par de tokens. */
  async start(userId: string): Promise<SessionCookies> {
    const session = await this.prisma.session.create({
      data: { userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return this.issue(this.prisma, session.id, userId, session.expiresAt);
  }

  /** Cambia un refresh por un par nuevo. null = no se puede (la API responde 401). */
  async rotate(refresh: string): Promise<SessionCookies | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refresh) },
      include: { session: { include: { user: { select: { disabledAt: true } } } } },
    });
    if (!token) return null;
    const { session } = token;
    if (session.revokedAt || session.expiresAt <= new Date() || session.user.disabledAt) return null;

    if (token.rotatedAt) {
      await this.handleReuse(token.sessionId, session.userId, token.rotatedAt);
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      // Consumo ATÓMICO (lección 63, regla 5): solo una petición puede ganar este token.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: token.id, rotatedAt: null },
        data: { rotatedAt: new Date() },
      });
      // Perdió una carrera legítima (dos pestañas a la vez): 401 sin castigo.
      if (claimed.count !== 1) return null;
      return this.issue(tx, session.id, session.userId, session.expiresAt);
    });
  }

  /** Cierra la sesión dueña de este refresh (logout). */
  async revokeByRefresh(refresh: string, reason: RevokeReason): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refresh) } });
    if (token) await this.revoke(token.sessionId, reason);
  }

  async revoke(sessionId: string, reason: RevokeReason, tx: Tx = this.prisma): Promise<void> {
    await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** `exceptSessionId`: la sesión desde la que se hace el cambio (activar 2FA) no se cierra a sí misma. */
  async revokeAllForUser(userId: string, reason: RevokeReason, tx: Tx = this.prisma, exceptSessionId?: string): Promise<void> {
    await tx.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  // Un refresh YA ROTADO volvió a aparecer: o es una carrera entre pestañas, o alguien lo robó.
  // "Gracia con evidencia" (lección 63, regla 3): solo es carrera si se rotó hace menos de
  // 10 s Y su sucesor DIRECTO (el token que nació al rotarlo) sigue sin usarse. Si la cadena
  // ya avanzó (r1 → r2 → r3) y reaparece r1, es robo aunque r3 esté vivo.
  // Ante robo se cierran TODAS las sesiones de la cuenta: el ladrón y la víctima vuelven a
  // entrar con contraseña, y solo la víctima la tiene.
  private async handleReuse(sessionId: string, userId: string, rotatedAt: Date): Promise<void> {
    const recent = Date.now() - rotatedAt.getTime() < REUSE_GRACE_MS;
    const successor = recent
      ? await this.prisma.refreshToken.findFirst({
          where: { sessionId, createdAt: { gte: rotatedAt } },
          orderBy: { createdAt: 'asc' },
          select: { rotatedAt: true },
        })
      : null;
    const isRace = successor !== null && successor.rotatedAt === null;
    if (!isRace) await this.revokeAllForUser(userId, 'reuse_detected');
  }

  private async issue(tx: Tx, sessionId: string, userId: string, expiresAt: Date): Promise<SessionCookies> {
    const refresh = newOpaqueToken();
    await tx.refreshToken.create({ data: { sessionId, tokenHash: sha256(refresh) } });
    const claims: AccessClaims = { sub: userId, sid: sessionId, typ: 'access' };
    const access = await this.jwt.signAsync(claims, { expiresIn: ACCESS_TTL_S });
    return {
      access,
      refresh,
      accessMaxAgeMs: ACCESS_TTL_S * 1000,
      refreshMaxAgeMs: expiresAt.getTime() - Date.now(),
    };
  }
}
