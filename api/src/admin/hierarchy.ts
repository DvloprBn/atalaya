// LA regla de la jerarquía, en un solo lugar y sin dependencias (fácil de probar):
//
//   Solo se gestiona lo que está ESTRICTAMENTE por debajo de tu nivel.
//
// - Un admin (3) gestiona usuario, staff y manager (0–2); nunca a otro admin.
// - Nadie se gestiona a sí mismo: tu nivel no es menor que tu nivel.
// - Nadie asigna un rol igual o mayor al suyo (no se fabrican pares ni jefes).

export function canManage(actorLevel: number, targetLevel: number): boolean {
  return targetLevel < actorLevel;
}

/**
 * La MISMA regla, como filtro de Prisma para las consultas (listar, ver, roles):
 * así la base solo devuelve lo gestionable. Una sola definición: si la regla
 * cambia, cambia en los dos lados a la vez (lección 24).
 */
export function manageableLevels(actorLevel: number): { lt: number } {
  return { lt: actorLevel };
}

/** ¿Puede `actor` llevar una cuenta de `fromLevel` a `toLevel`? Las dos deben estar por debajo. */
export function canAssign(actorLevel: number, fromLevel: number, toLevel: number): boolean {
  return canManage(actorLevel, fromLevel) && canManage(actorLevel, toLevel);
}
