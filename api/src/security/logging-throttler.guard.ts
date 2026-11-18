import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';
import { SecurityLog } from './security-log.service.js';

/**
 * El tope de peticiones de siempre, más un renglón en la bitácora cuando alguien lo supera.
 * Se guarda la RUTA registrada (`/api/auth/login`), nunca la URL de la petición: esa trae lo
 * que el visitante escribió. Con `dedupe`, un atacante que sigue golpeando deja una línea por
 * minuto y origen, no una por petición (si no, el tope mismo llenaría la base).
 */
@Injectable()
export class LoggingThrottlerGuard extends ThrottlerGuard {
  @Inject(SecurityLog) private readonly security!: SecurityLog;

  protected override async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const req = context.switchToHttp().getRequest<Request>();
    const route = typeof req.route?.path === 'string' ? `${req.method} ${req.route.path}` : 'unmatched';
    await this.security.record('rate_limited', { ip: req.ip, detail: route, dedupe: true });
    return super.throwThrottlingException(context, detail);
  }
}
