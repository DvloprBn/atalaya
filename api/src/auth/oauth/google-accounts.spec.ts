import { Prisma } from '../../generated/prisma/client.js';
import type { MailService } from '../../mail/mail.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { OAuthAccounts } from './google-accounts.js';

vi.stubEnv('DATABASE_URL', 'postgresql://x');
vi.stubEnv('REDIS_URL', 'redis://x');
vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
vi.stubEnv('APP_ORIGIN', 'http://localhost:3070');
vi.stubEnv('SMTP_URL', 'smtp://x:1025');
vi.stubEnv('MAIL_FROM', 'x@example.com');
vi.stubEnv('TOTP_ENCRYPTION_KEY', 'ab'.repeat(32));

const CLAIMS = { sub: 'google-sub-1', email: 'ana@example.com' };
type Found = Record<string, unknown> | null;

function build(opts: { identity?: Found; user?: Found } = {}) {
  const tx = {
    oAuthIdentity: { create: vi.fn().mockResolvedValue({}) },
    user: { create: vi.fn().mockResolvedValue({ id: 'nuevo' }) },
  };
  const prisma = {
    oAuthIdentity: { findUnique: vi.fn().mockResolvedValue(opts.identity ?? null) },
    user: { findUnique: vi.fn().mockResolvedValue(opts.user ?? null) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const mail = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const accounts = new OAuthAccounts(prisma as unknown as PrismaService, mail as unknown as MailService);
  return { accounts, prisma, tx, mail };
}
const verifiedUser = (extra = {}) => ({ id: 'u1', disabledAt: null, emailVerifiedAt: new Date(), oauthIdentities: [], ...extra });
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

describe('OAuthAccounts (a qué cuenta corresponde una cuenta de Google)', () => {
  it('regla 1: una identidad ya enlazada entra a SU cuenta, sin tocar el correo', async () => {
    const { accounts, prisma, tx } = build({ identity: { user: { id: 'u1', disabledAt: null } } });
    expect(await accounts.resolve({ sub: 'google-sub-1', email: 'otro-correo@example.com' })).toEqual({ userId: 'u1', outcome: 'login' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // no se busca por correo: el sub manda
    expect(tx.oAuthIdentity.create).not.toHaveBeenCalled();
  });

  it('una identidad de una cuenta desactivada no entra', async () => {
    const { accounts } = build({ identity: { user: { id: 'u1', disabledAt: new Date() } } });
    expect(await code(accounts.resolve(CLAIMS))).toBe('account_denied');
  });

  it('regla 2: un correo con cuenta verificada se VINCULA y se avisa al dueño, en la misma transacción', async () => {
    const { accounts, tx, mail } = build({ user: verifiedUser() });
    expect(await accounts.resolve(CLAIMS)).toEqual({ userId: 'u1', outcome: 'linked' });
    expect(tx.oAuthIdentity.create).toHaveBeenCalledWith({ data: { userId: 'u1', provider: 'google', subject: 'google-sub-1', email: 'ana@example.com' } });
    expect(mail.enqueue).toHaveBeenCalledWith('ana@example.com', expect.objectContaining({ subject: expect.stringContaining('Google') }), tx);
  });

  it('no vincula una cuenta desactivada, una sin correo verificado, ni una que ya tiene OTRA cuenta de Google', async () => {
    for (const user of [verifiedUser({ disabledAt: new Date() }), verifiedUser({ emailVerifiedAt: null }), verifiedUser({ oauthIdentities: [{ id: 'x' }] })]) {
      const { accounts, tx, mail } = build({ user });
      expect(await code(accounts.resolve(CLAIMS))).toBe('account_denied');
      expect(tx.oAuthIdentity.create).not.toHaveBeenCalled();
      expect(mail.enqueue).not.toHaveBeenCalled();
    }
  });

  it('regla 3: un correo sin cuenta crea una cuenta NUEVA de rol usuario, verificada y sin contraseña', async () => {
    const { accounts, tx } = build();
    expect(await accounts.resolve(CLAIMS)).toEqual({ userId: 'nuevo', outcome: 'created' });
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'ana@example.com', roleId: 1 });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(data.passwordHash).toBeUndefined();
    expect(tx.oAuthIdentity.create).toHaveBeenCalledWith({ data: { userId: 'nuevo', provider: 'google', subject: 'google-sub-1', email: 'ana@example.com' } });
  });

  it('carrera: si dos intentos crean la misma cuenta a la vez, el segundo choca y vuelve a mirar', async () => {
    const { accounts, prisma } = build();
    prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    prisma.oAuthIdentity.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: { id: 'u9', disabledAt: null } });
    expect(await accounts.resolve(CLAIMS)).toEqual({ userId: 'u9', outcome: 'login' });
  });

  it('otro error de base de datos NO se traga', async () => {
    const { accounts, prisma } = build();
    prisma.$transaction.mockRejectedValueOnce(new Error('se cayó la base'));
    await expect(accounts.resolve(CLAIMS)).rejects.toThrow('se cayó la base');
  });
});
