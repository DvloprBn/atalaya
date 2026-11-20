// v1.0 · Una cuenta de la demo VENCIDA se trata igual que una desactivada: no entra, y sus sesiones dejan de servir
// al instante, aunque el barrido (cada 15 min) todavía no la haya borrado. Se usa en los mismos lugares que `disabledAt`.

/** ¿Ya pasó su fecha de borrado? Las cuentas sin fecha (fuera de la demo, sembradas) nunca vencen. */
export function isExpired(user: { expiresAt: Date | null }, now = new Date()): boolean {
  return user.expiresAt !== null && user.expiresAt <= now;
}

/** El mismo criterio como filtro de Prisma, para condicionarlo en la propia consulta. */
export function notExpired(now = new Date()) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}
