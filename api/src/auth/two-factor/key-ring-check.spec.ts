import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { KeyRingCheck } from './key-ring-check.js';
import { SecretBox } from './secret-box.js';
import { newSecret } from './totp.js';

// Solo lo que usa la revisión: leer las filas (la revisión en seco no escribe).
const dbWith = (rows: { userId: string; secretEnc: string }[]) =>
  ({ twoFactor: { findMany: async ({ where }: { where: { userId?: { gt: string } } }) => (where.userId ? [] : rows) } }) as unknown as PrismaService;

describe('KeyRingCheck (S-9): avisa al arrancar si el llavero no abre la base', () => {
  const key = randomBytes(32);
  const row = (k: Buffer, id: string) => ({ userId: id, secretEnc: new SecretBox(k).encrypt(newSecret(), id) });

  afterEach(() => vi.restoreAllMocks());

  it('llave equivocada → ERROR con el conteo, sin ids ni secretos', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await new KeyRingCheck(dbWith([row(randomBytes(32), 'u1'), row(key, 'u2')]), new SecretBox(key)).check();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('1 de 2 secretos del 2FA NO abren');
    expect(String(error.mock.calls[0][0])).not.toContain('u1');
  });

  it('rotación a medias → AVISO; todo con la llave actual → silencio', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const fresh = randomBytes(32);
    await new KeyRingCheck(dbWith([row(key, 'u1')]), new SecretBox(fresh, [key])).check();
    expect(String(warn.mock.calls[0][0])).toContain('siguen con una llave anterior');

    warn.mockClear();
    await new KeyRingCheck(dbWith([row(key, 'u1')]), new SecretBox(key)).check();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
