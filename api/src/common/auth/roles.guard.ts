import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/current-user.decorator.js';
import { MIN_LEVEL } from './min-level.decorator.js';

// Guarda global de NIVEL (corre después de AuthGuard, que ya dejó al usuario en
// la petición, leído de la base en esta misma petición).
// Responde 403: la ruta existe y es de "personal"; lo que falta es nivel (OWASP API5).
// Qué objetos puede tocar cada nivel dentro de una ruta lo decide el servicio
// (admin/hierarchy.ts): esta guarda solo abre o cierra la puerta.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<number | undefined>(MIN_LEVEL, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    // Sin usuario aquí, algo se configuró mal (ruta pública con nivel): se niega.
    if (!user || user.role.level < required) throw new ForbiddenException();
    return true;
  }
}
