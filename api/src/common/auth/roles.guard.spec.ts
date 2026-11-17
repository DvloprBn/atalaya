import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LEVEL, MinLevel } from './min-level.decorator.js';
import { RolesGuard } from './roles.guard.js';

@MinLevel(LEVEL.admin)
class AdminController {
  list() {}
}
class OpenController {
  me() {}
}

function contextFor(controller: Function, method: string, level?: number) {
  const user = level === undefined ? undefined : { role: { level } };
  return {
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('sin @MinLevel deja pasar a cualquier nivel (la sesión ya la revisó AuthGuard)', () => {
    expect(guard.canActivate(contextFor(OpenController, 'me', LEVEL.usuario))).toBe(true);
  });

  it.each([LEVEL.admin, LEVEL.director, LEVEL.super])('nivel %i entra a una ruta de admin', (level) => {
    expect(guard.canActivate(contextFor(AdminController, 'list', level))).toBe(true);
  });

  it.each([LEVEL.usuario, LEVEL.staff, LEVEL.manager])('nivel %i recibe 403 en una ruta de admin', (level) => {
    expect(() => guard.canActivate(contextFor(AdminController, 'list', level))).toThrow(ForbiddenException);
  });

  it('sin usuario en la petición (configuración rota) se niega, no se abre', () => {
    expect(() => guard.canActivate(contextFor(AdminController, 'list'))).toThrow(ForbiddenException);
  });
});
