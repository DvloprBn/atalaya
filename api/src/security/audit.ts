import type { Prisma } from '../generated/prisma/client.js';

export type AuditAction =
  | 'user_created'
  | 'role_changed'
  | 'user_disabled'
  | 'user_enabled'
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'recovery_codes_regenerated';

/**
 * Escribe una entrada de auditoría DENTRO de la transacción de la acción que registra: o se
 * guardan las dos o ninguna. «No hay registro, no hay acción» es lo que hace útil una auditoría;
 * una que puede perder entradas en silencio no sirve para reconstruir nada.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  action: AuditAction,
  actorId: string,
  targetId: string,
  detail?: string,
): Promise<void> {
  await tx.auditLog.create({ data: { action, actorId, targetId, detail: detail ?? null } });
}
