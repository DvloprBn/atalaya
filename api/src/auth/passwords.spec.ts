import { hashPassword, passwordContainsEmail, verifyPassword } from './passwords.js';

describe('passwords', () => {
  it('guarda Argon2id y verifica la contraseña correcta', async () => {
    const hash = await hashPassword('una frase larga de prueba');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'una frase larga de prueba')).toBe(true);
    expect(await verifyPassword(hash, 'otra frase larga de prueba')).toBe(false);
  });

  it('sin cuenta (hash null) responde false, tras hacer el mismo trabajo', async () => {
    expect(await verifyPassword(null, 'cualquier cosa')).toBe(false);
  });

  it('un hash dañado nunca abre la puerta', async () => {
    expect(await verifyPassword('no-es-un-hash', 'x')).toBe(false);
  });

  it('detecta la parte local del correo dentro de la contraseña', () => {
    expect(passwordContainsEmail('mi-ANA-segura-2026', 'ana@example.com')).toBe(true);
    expect(passwordContainsEmail('una frase larga', 'ana@example.com')).toBe(false);
    // Partes locales de 1–2 letras no se buscan: rechazarían casi cualquier contraseña.
    expect(passwordContainsEmail('una frase larga', 'a@example.com')).toBe(false);
  });
});
