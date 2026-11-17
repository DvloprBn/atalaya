import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DenyByDefaultGuard } from './deny-by-default.guard.js';
import { Public } from './public.decorator.js';

// Construye el "contexto" que Nest le daría a la guarda para una ruta dada.
function contextFor(handler: () => void, controller: object): ExecutionContext {
  return { getHandler: () => handler, getClass: () => controller } as unknown as ExecutionContext;
}

class SampleController {
  open() {}
  closed() {}
}
Public()(SampleController.prototype, 'open', Object.getOwnPropertyDescriptor(SampleController.prototype, 'open')!);

describe('DenyByDefaultGuard', () => {
  const guard = new DenyByDefaultGuard(new Reflector());

  it('deja pasar una ruta marcada con @Public()', () => {
    expect(guard.canActivate(contextFor(SampleController.prototype.open, SampleController))).toBe(true);
  });

  it('cierra con 401 una ruta sin marca (cerrado por defecto)', () => {
    expect(() => guard.canActivate(contextFor(SampleController.prototype.closed, SampleController))).toThrow(
      UnauthorizedException,
    );
  });
});
