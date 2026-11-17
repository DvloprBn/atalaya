import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { OriginGuard } from './origin.guard.js';

process.env.APP_ORIGIN ??= 'http://localhost:3070';

function contextFor(method: string, headers: Record<string, string>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ method, headers }) }) } as unknown as ExecutionContext;
}

describe('OriginGuard (CSRF)', () => {
  // loadEnv exige todas las variables; las pruebas solo necesitan APP_ORIGIN.
  vi.stubEnv('DATABASE_URL', 'postgresql://x');
  vi.stubEnv('REDIS_URL', 'redis://x');
  vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
  vi.stubEnv('SMTP_URL', 'smtp://x:1025');
  vi.stubEnv('MAIL_FROM', 'x@example.com');
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3070');
  const guard = new OriginGuard();

  it('deja pasar lecturas (GET) vengan de donde vengan', () => {
    expect(guard.canActivate(contextFor('GET', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
  });

  it('deja pasar un POST del mismo sitio', () => {
    expect(guard.canActivate(contextFor('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('rechaza un POST que un navegador marca como de otro sitio', () => {
    expect(() => guard.canActivate(contextFor('POST', { 'sec-fetch-site': 'cross-site' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor('POST', { 'sec-fetch-site': 'same-site' }))).toThrow(ForbiddenException);
  });

  it('con navegadores viejos (sin Sec-Fetch-Site) compara Origin', () => {
    expect(() => guard.canActivate(contextFor('POST', { origin: 'https://evil.example' }))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor('POST', { origin: 'http://localhost:3070' }))).toBe(true);
  });

  it('deja pasar un cliente sin navegador (sin cabeceras): no puede ser CSRF', () => {
    expect(guard.canActivate(contextFor('POST', {}))).toBe(true);
  });
});
