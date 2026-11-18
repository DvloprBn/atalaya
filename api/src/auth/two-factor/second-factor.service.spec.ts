import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { RateLimits } from '../rate-limits.js';
import type { SecurityLog } from '../../security/security-log.service.js';
import type { SessionsService } from '../sessions.service.js';
import type { Challenges } from './challenges.js';
import { hashRecoveryCode } from './recovery-codes.js';
import { SecondFactorService } from './second-factor.service.js';
import { SecretBox } from './secret-box.js';
import { base32Decode, hotp, newSecret, stepAt } from './totp.js';

const USER = { id: 'u1', email: 'ana@example.com', role: { name: 'usuario', level: 0 } };
const TOKENS = { access: 'a', refresh: 'r', accessMaxAgeMs: 1, refreshMaxAgeMs: 1 };
const box = new SecretBox(randomBytes(32));

function build(opts: { challengeOwner?: string | null; locked?: boolean; wins?: boolean; user?: typeof USER | null; codeOk?: boolean } = {}) {
  const { challengeOwner = 'u1', locked = false, wins = true, user = USER } = opts;
  const prisma = { user: { findFirst: vi.fn().mockResolvedValue(user) } };
  const limits = {
    isTwoFactorLocked: vi.fn().mockResolvedValue(locked),
    recordTwoFactorFailure: vi.fn().mockResolvedValue(undefined),
    clearTwoFactorFailures: vi.fn().mockResolvedValue(undefined),
  };
  const challenges = {
    peek: vi.fn().mockResolvedValue(challengeOwner),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(wins),
  };
  const sessions = { start: vi.fn().mockResolvedValue(TOKENS) };
  const security = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new SecondFactorService(
    prisma as unknown as PrismaService, box, limits as unknown as RateLimits,
    challenges as unknown as Challenges, sessions as unknown as SessionsService, security as unknown as SecurityLog,
  );
  // Aislamos el reto de la comprobación del código (que se prueba aparte, abajo).
  const checkCode = vi.spyOn(service, 'checkCode').mockResolvedValue(opts.codeOk ?? true);
  return { service, limits, challenges, sessions, checkCode, security };
}

describe('SecondFactorService.verifyLogin', () => {
  it('un reto que no existe (o ya se gastó) da null y ni siquiera mira el código', async () => {
    const { service, checkCode } = build({ challengeOwner: null });
    expect(await service.verifyLogin('reto', '123456')).toBeNull();
    expect(checkCode).not.toHaveBeenCalled();
  });

  it('cuenta bloqueada por intentos: ni el código correcto entra, y no se mira el código', async () => {
    const { service, checkCode, sessions } = build({ locked: true });
    expect(await service.verifyLogin('reto', '123456')).toBeNull();
    expect(checkCode).not.toHaveBeenCalled();
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('un código malo suma un fallo a la cuenta y al reto, y no abre sesión', async () => {
    const { service, limits, challenges, sessions, security } = build({ codeOk: false });
    expect(await service.verifyLogin('reto', '000000', '203.0.113.9')).toBeNull();
    expect(security.record).toHaveBeenCalledWith('two_factor_failed', { userId: 'u1', ip: '203.0.113.9', detail: 'login' });
    expect(limits.recordTwoFactorFailure).toHaveBeenCalledWith('u1');
    expect(challenges.recordFailure).toHaveBeenCalledWith('reto');
    expect(challenges.consume).not.toHaveBeenCalled();
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('con el código bueno gasta el reto, limpia los fallos y abre sesión', async () => {
    const { service, limits, challenges, sessions } = build();
    expect(await service.verifyLogin('reto', '123456')).toEqual({ tokens: TOKENS, user: USER });
    expect(challenges.consume).toHaveBeenCalledWith('reto');
    expect(limits.clearTwoFactorFailures).toHaveBeenCalledWith('u1');
    expect(sessions.start).toHaveBeenCalledWith('u1');
  });

  it('si otra petición gana el reto en la misma carrera, esta NO abre sesión', async () => {
    const { service, sessions } = build({ wins: false });
    expect(await service.verifyLogin('reto', '123456')).toBeNull();
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('una cuenta desactivada entre la contraseña y el código no entra', async () => {
    const { service, sessions } = build({ user: null });
    expect(await service.verifyLogin('reto', '123456')).toBeNull();
    expect(sessions.start).not.toHaveBeenCalled();
  });
});

describe('SecondFactorService.checkCode', () => {
  function build2(rows: { secret?: string; updateCount?: number }) {
    const secret = rows.secret ?? newSecret();
    const prisma = {
      twoFactor: {
        findFirst: vi.fn().mockResolvedValue({ secretEnc: box.encrypt(secret, 'u1'), confirmedAt: new Date() }),
        updateMany: vi.fn().mockResolvedValue({ count: rows.updateCount ?? 1 }),
      },
      recoveryCode: { updateMany: vi.fn().mockResolvedValue({ count: rows.updateCount ?? 1 }) },
    };
    const service = new SecondFactorService(
      prisma as unknown as PrismaService, box, {} as RateLimits, {} as Challenges, {} as SessionsService, {} as SecurityLog,
    );
    return { service, prisma, secret };
  }
  const nowCode = (secret: string) => hotp(base32Decode(secret), stepAt(Date.now()));

  it('un código TOTP bueno se acepta y registra su paso con una condición "mayor que el último"', async () => {
    const { service, prisma, secret } = build2({});
    expect(await service.checkCode('u1', nowCode(secret))).toBe(true);
    const where = prisma.twoFactor.updateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ lastUsedStep: null }, { lastUsedStep: { lt: stepAt(Date.now()) } }]);
  });

  it('si el UPDATE condicionado no cambia ninguna fila (el paso ya se usó), se rechaza', async () => {
    const { service, secret } = build2({ updateCount: 0 });
    expect(await service.checkCode('u1', nowCode(secret))).toBe(false);
  });

  it('un código TOTP de otro secreto no pasa ni toca la base', async () => {
    const { service, prisma } = build2({});
    expect(await service.checkCode('u1', nowCode(newSecret()))).toBe(false);
    expect(prisma.twoFactor.updateMany).not.toHaveBeenCalled();
  });

  it('un código de recuperación se busca por su hash y se marca usado en un solo UPDATE', async () => {
    const { service, prisma } = build2({});
    expect(await service.checkCode('u1', 'abcd-efgh-ijkl-mnop')).toBe(true);
    expect(prisma.recoveryCode.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u1', codeHash: hashRecoveryCode('ABCDEFGHIJKLMNOP'), usedAt: null,
    });
  });

  it('un texto que no es código (ni 6 dígitos ni recuperación) se rechaza sin tocar la base', async () => {
    const { service, prisma } = build2({});
    for (const junk of ['', 'hola', '12345', "' OR 1=1 --"]) expect(await service.checkCode('u1', junk)).toBe(false);
    expect(prisma.recoveryCode.updateMany).not.toHaveBeenCalled();
  });

  it('un secreto que no descifra (llave equivocada) niega el acceso en vez de reventar', async () => {
    const { service, prisma } = build2({});
    prisma.twoFactor.findFirst.mockResolvedValue({ secretEnc: new SecretBox(randomBytes(32)).encrypt('X', 'u1'), confirmedAt: new Date() });
    expect(await service.checkCode('u1', '123456')).toBe(false);
  });
});
