import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../common/auth/public.decorator.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthGuard } from './auth.guard.js';
import { ACCESS_COOKIE } from './cookies.js';

const SECRET = 'x'.repeat(32);
const JWT = { issuer: 'atalaya-api', audience: 'atalaya-web' };
const jwt = new JwtService({
  secret: SECRET,
  signOptions: { algorithm: 'HS256', ...JWT },
  verifyOptions: { algorithms: ['HS256'], ...JWT },
});
const USER = { id: 'u1', email: 'ana@example.com', role: { name: 'usuario', level: 0 } };

class SampleController {
  open() {}
  closed() {}
}
Public()(SampleController.prototype, 'open', Object.getOwnPropertyDescriptor(SampleController.prototype, 'open')!);

function contextFor(handler: () => void, cookies: Record<string, string> = {}) {
  const req: Record<string, unknown> = { cookies };
  const ctx = {
    getHandler: () => handler,
    getClass: () => SampleController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

/** sessionAlive = lo que respondería la base: ¿la sesión sigue abierta y la cuenta activa? */
function guardWith(sessionAlive: boolean) {
  const prisma = {
    session: { findFirst: () => Promise.resolve(sessionAlive ? { user: USER } : null) },
  } as unknown as PrismaService;
  return new AuthGuard(new Reflector(), jwt, prisma);
}

const validToken = () => jwt.signAsync({ sub: 'u1', sid: 's1', typ: 'access' }, { expiresIn: 600 });

describe('AuthGuard', () => {
  it('deja pasar una ruta @Public() sin cookie', async () => {
    expect(await guardWith(true).canActivate(contextFor(SampleController.prototype.open).ctx)).toBe(true);
  });

  it('cierra con 401 una ruta sin marca si no hay cookie (cerrado por defecto)', async () => {
    await expect(guardWith(true).canActivate(contextFor(SampleController.prototype.closed).ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('acepta un token válido con sesión viva y deja al usuario en la petición', async () => {
    const { ctx, req } = contextFor(SampleController.prototype.closed, { [ACCESS_COOKIE]: await validToken() });
    expect(await guardWith(true).canActivate(ctx)).toBe(true);
    expect(req.user).toEqual({ ...USER, sessionId: 's1' });
  });

  it('rechaza un token válido si la sesión ya se cerró (logout o cambio de contraseña)', async () => {
    const { ctx } = contextFor(SampleController.prototype.closed, { [ACCESS_COOKIE]: await validToken() });
    await expect(guardWith(false).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token con "alg: none" (sin firma)', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u1', sid: 's1', typ: 'access', ...JWT })}.`;
    const { ctx } = contextFor(SampleController.prototype.closed, { [ACCESS_COOKIE]: forged });
    await expect(guardWith(true).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token firmado con otra llave', async () => {
    const other = new JwtService({ secret: 'y'.repeat(32), signOptions: { algorithm: 'HS256', ...JWT } });
    const token = await other.signAsync({ sub: 'u1', sid: 's1', typ: 'access' }, { expiresIn: 600 });
    const { ctx } = contextFor(SampleController.prototype.closed, { [ACCESS_COOKIE]: token });
    await expect(guardWith(true).canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
