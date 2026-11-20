// S-9 · Re-cifra los secretos del 2FA con la llave ACTUAL del llavero. Lo usa el comando src/cli/rotar-llave-totp.ts.
//
// Cómo se hace sin dejar a nadie fuera (el procedimiento completo está en docs/laboratorio/v1.0-rotacion-totp.md):
//   1. La API arranca con la llave nueva como actual y la vieja en TOTP_ENCRYPTION_KEYS_OLD: lee las dos.
//   2. Este proceso re-cifra cada fila que no esté ya con la actual.
//   3. Cuando --check dice 0 pendientes, la vieja se puede retirar (salvo que haya respaldos de la base cifrados con ella).
//
// Seguro con la API andando: cada fila se escribe con «compara y cambia» (solo si secretEnc sigue siendo el que leímos).
// Si la persona reactivó su 2FA a la vez, su fila ya trae un secreto nuevo con la llave actual y aquí no se toca.
import type { PrismaClient } from '../../generated/prisma/client.js';
import { writeAudit } from '../../security/audit.js';
import type { SecretBox } from './secret-box.js';

const BATCH = 200;

export interface RotationReport {
  /** Filas de 2FA revisadas (activas y pendientes). */
  total: number;
  /** Ya estaban con la llave actual. */
  current: number;
  /** Re-cifradas ahora (o, en --check, las que faltan). */
  rotated: number;
  /** Cambiaron mientras tanto (la persona reactivó o quitó su 2FA): no se tocan y no hace falta. */
  changedMeanwhile: number;
  /** Ninguna llave del llavero las abre: ids de usuario (no son secretos) para revisarlas a mano. */
  failed: string[];
}

export async function rotateTotpKey(prisma: PrismaClient, box: SecretBox, opts: { dryRun: boolean }): Promise<RotationReport> {
  const report: RotationReport = { total: 0, current: 0, rotated: 0, changedMeanwhile: 0, failed: [] };
  let after = '';

  // Por lotes y en orden de id: memoria acotada aunque haya muchas cuentas, y cada lote es una consulta corta.
  for (;;) {
    const rows = await prisma.twoFactor.findMany({
      where: after ? { userId: { gt: after } } : {},
      select: { userId: true, secretEnc: true },
      orderBy: { userId: 'asc' },
      take: BATCH,
    });
    if (rows.length === 0) break;
    after = rows[rows.length - 1].userId;

    for (const row of rows) {
      report.total++;
      if (!box.needsRotation(row.secretEnc)) {
        report.current++;
        continue;
      }
      let plain: string;
      try {
        plain = box.decrypt(row.secretEnc, row.userId);
      } catch {
        report.failed.push(row.userId);
        continue;
      }
      if (opts.dryRun) {
        report.rotated++;
        continue;
      }
      const done = await prisma.twoFactor.updateMany({
        where: { userId: row.userId, secretEnc: row.secretEnc }, // compara y cambia
        data: { secretEnc: box.encrypt(plain, row.userId) },
      });
      if (done.count === 1) report.rotated++;
      else report.changedMeanwhile++;
    }
  }

  if (!opts.dryRun && report.rotated > 0) {
    // Una acción del sistema sobre todas las cuentas: sin actor ni destino. El kid es público (no revela la llave).
    await prisma.$transaction((tx) => writeAudit(tx, 'totp_key_rotated', null, null, `filas=${report.rotated} kid=${box.kid}`));
  }
  return report;
}
