import { isCommonPassword } from './common-passwords.js';
import { PASSWORD_CONTAINS_EMAIL, PASSWORD_TOO_COMMON, passwordProblem } from './passwords.js';

describe('S-8 · contraseñas comunes', () => {
  it.each([
    'password1234', 'Password2026!', 'P@ssw0rd2026!', 'p@$$w0rd!!!!!', 'PASSWORD-PASSWORD',   // la palabra base, con variantes
    'Contraseña2026', 'contrasena123456', 'Bienvenido2026!', 'MiContrasena', 'mi-clave-1234',  // español, con acentos y separadores
    'qwertyuiop12', 'qwerty123456', 'asdfghjkl123', 'zxcvbnm12345', // teclado en fila
    '123456789012', '987654321098', 'abcdefghijkl', '000000000000', 'aaaaaaaaaaaa',          // secuencias y repeticiones
    'abcabcabcabc', '121212121212', 'holahola2026', 'iloveyou2026!!', 'letmein-letmein',
  ])('rechaza «%s»', (p) => {
    expect(isCommonPassword(p), p).toBe(true);
  });

  it.each([
    'correct horse battery staple', 'Mi perro Fénix duerme en el sofá', 'violeta-cobre-nube-92',
    'tr0ub4dor&3-pero-largo', 'El cafe de la esquina abre a las 7', 'wvKp3dQ8zXb1',
    'passwordless login rocks', 'unPasswordNoEsLoMismo!', // contiene la palabra, pero no ES la palabra con cola
  ])('acepta «%s»', (p) => {
    expect(isCommonPassword(p), p).toBe(false);
  });

  it('passwordProblem da un motivo claro y no depende de si la cuenta existe', () => {
    expect(passwordProblem('mi-ANA-segura-2026', 'ana@example.com')).toBe(PASSWORD_CONTAINS_EMAIL);
    expect(passwordProblem('Password2026!', 'ana@example.com')).toBe(PASSWORD_TOO_COMMON);
    expect(passwordProblem('violeta-cobre-nube-92', 'ana@example.com')).toBeNull();
  });
});
