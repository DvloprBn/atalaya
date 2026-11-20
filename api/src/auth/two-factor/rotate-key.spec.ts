import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { rotateTotpKey } from './rotate-key.js';
import { SecretBox, keyId } from './secret-box.js';
import { newSecret } from './totp.js';

type Row = { userId: string; secretEnc: string };

/**
 * Una base FALSA en memoria con solo lo que usa la rotación. `beforeUpdate` deja simular a otra petición que
 * cambia la fila justo entre la lectura y la escritura (la carrera que el «compara y cambia» debe resistir).
 */
function fakeDb(rows: Row[], beforeUpdate?: (userId: string) => void) {
  const audit: { action: string; actorId: string | null; targetId: string | null; detail: string | null }[] = [];
  const db = {
    twoFactor: {
      findMany: async ({ where, take }: { where: { userId?: { gt: string } }; take: number }) =>
        rows
          .filter((r) => !where.userId || r.userId > where.userId.gt)
          .sort((a, b) => a.userId.localeCompare(b.userId))
          .slice(0, take)
          .map((r) => ({ ...r })),
      // Filtra SOLO por los campos que recibe (como la base de verdad): una versión sin «compara y cambia» también corre aquí.
      updateMany: async ({ where, data }: { where: Partial<Row> & { userId: string }; data: { secretEnc: string } }) => {
        beforeUpdate?.(where.userId);
        const row = rows.find((r) => r.userId === where.userId && (where.secretEnc === undefined || r.secretEnc === where.secretEnc));
        if (!row) return { count: 0 };
        row.secretEnc = data.secretEnc;
        return { count: 1 };
      },
    },
    auditLog: { create: async ({ data }: { data: (typeof audit)[number] }) => audit.push(data) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { prisma: db as unknown as PrismaClient, audit };
}

const oldKey = randomBytes(32);
const newKey = randomBytes(32);
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('rotateTotpKey (S-9)', () => {
  it('re-cifra TODAS las filas con la llave nueva, en lotes (450 filas > 2 lotes), sin cambiar ningún secreto', async () => {
    const before = new SecretBox(oldKey);
    const secrets = new Map<string, string>();
    const rows = Array.from({ length: 450 }, (_, i) => {
      const s = newSecret();
      secrets.set(id(i), s);
      return { userId: id(i), secretEnc: before.encrypt(s, id(i)) };
    });
    const { prisma, audit } = fakeDb(rows);
    const during = new SecretBox(newKey, [oldKey]);

    const r = await rotateTotpKey(prisma, during, { dryRun: false });
    expect(r).toEqual({ total: 450, current: 0, rotated: 450, changedMeanwhile: 0, failed: [] });
    // Con SOLO la llave nueva, todo abre y da el mismo secreto de antes: la gente no tiene que volver a escanear el QR.
    const after = new SecretBox(newKey);
    for (const row of rows) expect(after.decrypt(row.secretEnc, row.userId)).toBe(secrets.get(row.userId));
    expect(audit).toEqual([{ action: 'totp_key_rotated', actorId: null, targetId: null, detail: `filas=450 kid=${keyId(newKey)}` }]);

    // Correrla otra vez no hace nada ni deja otra entrada en la auditoría (es idempotente).
    expect(await rotateTotpKey(prisma, during, { dryRun: false })).toMatchObject({ current: 450, rotated: 0 });
    expect(audit).toHaveLength(1);
  });

  it('--check cuenta lo que falta y NO escribe nada', async () => {
    const rows = [{ userId: id(1), secretEnc: new SecretBox(oldKey).encrypt(newSecret(), id(1)) }];
    const snapshot = rows[0].secretEnc;
    const { prisma, audit } = fakeDb(rows);
    expect(await rotateTotpKey(prisma, new SecretBox(newKey, [oldKey]), { dryRun: true })).toMatchObject({ rotated: 1 });
    expect(rows[0].secretEnc).toBe(snapshot);
    expect(audit).toHaveLength(0);
  });

  it('carrera: si la persona reactiva su 2FA entre la lectura y la escritura, NO se pisa su secreto nuevo', async () => {
    const during = new SecretBox(newKey, [oldKey]);
    const rows = [{ userId: id(1), secretEnc: new SecretBox(oldKey).encrypt(newSecret(), id(1)) }];
    const fresh = during.encrypt(newSecret(), id(1)); // lo que dejaría /2fa/setup en ese instante
    const { prisma } = fakeDb(rows, () => (rows[0].secretEnc = fresh));

    expect(await rotateTotpKey(prisma, during, { dryRun: false })).toMatchObject({ rotated: 0, changedMeanwhile: 1 });
    expect(rows[0].secretEnc).toBe(fresh);
  });

  it('una fila que no abre con ninguna llave se reporta por id (sin secretos) y no se toca; las demás sí se rotan', async () => {
    const lost = randomBytes(32); // una llave que ya nadie tiene
    const rows = [
      { userId: id(1), secretEnc: new SecretBox(lost).encrypt(newSecret(), id(1)) },
      { userId: id(2), secretEnc: new SecretBox(oldKey).encrypt(newSecret(), id(2)) },
    ];
    const orphan = rows[0].secretEnc;
    const { prisma } = fakeDb(rows);

    const r = await rotateTotpKey(prisma, new SecretBox(newKey, [oldKey]), { dryRun: false });
    expect(r).toMatchObject({ rotated: 1, failed: [id(1)] });
    expect(rows[0].secretEnc).toBe(orphan);
  });
});
