import { canAssign, canManage, manageableLevels } from './hierarchy.js';

const LEVELS = [0, 1, 2, 3, 4, 5];

describe('jerarquía', () => {
  // Las 36 combinaciones: la regla entera, sin excepciones escondidas.
  it.each(LEVELS.flatMap((actor) => LEVELS.map((target) => [actor, target])))(
    'nivel %i gestiona nivel %i solo si está estrictamente por debajo',
    (actor, target) => {
      expect(canManage(actor, target)).toBe(target < actor);
    },
  );

  it('el filtro de la base dice exactamente lo mismo que canManage (una sola regla)', () => {
    for (const actor of LEVELS) {
      for (const target of LEVELS) expect(target < manageableLevels(actor).lt).toBe(canManage(actor, target));
    }
  });

  it('nadie se gestiona a sí mismo, ni el super', () => {
    for (const level of LEVELS) expect(canManage(level, level)).toBe(false);
  });

  it('un admin (3) sube a staff hasta manager, pero no a admin ni más', () => {
    expect(canAssign(3, 1, 2)).toBe(true);
    expect(canAssign(3, 1, 3)).toBe(false);
    expect(canAssign(3, 1, 5)).toBe(false);
  });

  it('un admin no puede bajar a otro admin (aunque el destino sí esté por debajo)', () => {
    expect(canAssign(3, 3, 0)).toBe(false);
  });
});
