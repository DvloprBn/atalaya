import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './passwords.js';
import type { RateLimits } from './rate-limits.js';
import type { SessionsService } from './sessions.service.js';

const PASSWORD = 'una frase larga de prueba';
const TOKENS = { access: 'a', refresh: 'r', accessMaxAgeMs: 1, refreshMaxAgeMs: 1 };

async function build({ exists = true, disabled = false, locked = false } = {}) {
  const user = {
    id: 'u1',
    email: 'ana@example.com',
    passwordHash: await hashPassword(PASSWORD),
    disabledAt: disabled ? new Date() : null,
    role: { name: 'usuario', level: 0 },
  };
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(exists ? user : null) } };
  const limits = {
    isLoginLocked: vi.fn().mockResolvedValue(locked),
    recordLoginFailure: vi.fn().mockResolvedValue(undefined),
    clearLoginFailures: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = { start: vi.fn().mockResolvedValue(TOKENS) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    limits as unknown as RateLimits,
    sessions as unknown as SessionsService,
  );
  return { service, prisma, limits, sessions };
}

describe('AuthService.login', () => {
  it('con la contraseña correcta abre sesión y limpia los fallos', async () => {
    const { service, limits, sessions } = await build();
    const result = await service.login('ana@example.com', PASSWORD);
    expect(result?.user).toEqual({ id: 'u1', email: 'ana@example.com', role: { name: 'usuario', level: 0 } });
    expect(sessions.start).toHaveBeenCalledWith('u1');
    expect(limits.clearLoginFailures).toHaveBeenCalled();
  });

  it('contraseña mala, cuenta inexistente y cuenta desactivada se ven IGUAL (null) y cuentan como fallo', async () => {
    for (const scenario of [{ password: 'mala' }, { exists: false }, { disabled: true }]) {
      const { service, limits, sessions } = await build(scenario);
      expect(await service.login('ana@example.com', scenario.password ?? PASSWORD)).toBeNull();
      expect(limits.recordLoginFailure).toHaveBeenCalledWith('ana@example.com');
      expect(sessions.start).not.toHaveBeenCalled();
    }
  });

  it('bloqueada por intentos: ni la contraseña correcta entra, y ni siquiera consulta la base', async () => {
    const { service, prisma, sessions } = await build({ locked: true });
    expect(await service.login('ana@example.com', PASSWORD)).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // lección 63: el freno va ANTES de la base
    expect(sessions.start).not.toHaveBeenCalled();
  });
});
