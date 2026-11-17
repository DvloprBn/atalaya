import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from '../common/auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACCESS_COOKIE } from './cookies.js';
import type { AuthUser } from './current-user.decorator.js';
import type { AccessClaims } from './sessions.service.js';

// Guarda global de acceso. Sigue siendo "cerrado por defecto" (v0.1): lo que no
// es @Public() exige sesión. Y la sesión se revisa en la BASE en cada petición
// (lección 126): el JWT solo dice quién eres; si la sesión se cerró (logout,
// cambio de contraseña, robo detectado) o la cuenta se desactivó, el acceso se
// corta al instante aunque al token le queden minutos de vida.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string') throw new UnauthorizedException();

    let claims: AccessClaims;
    try {
      // Algoritmo, emisor y audiencia fijados en auth.module.ts: un token "alg: none"
      // o firmado para otra app no pasa.
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (claims.typ !== 'access') throw new UnauthorizedException();

    const session = await this.prisma.session.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { disabledAt: null },
      },
      select: { user: { select: { id: true, email: true, role: { select: { name: true, level: true } } } } },
    });
    if (!session) throw new UnauthorizedException();

    req.user = { ...session.user, sessionId: claims.sid };
    return true;
  }
}
