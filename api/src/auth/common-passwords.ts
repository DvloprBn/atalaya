// S-8: rechaza las contraseñas que cualquiera probaría primero (NIST 800-63B pide compararlas contra una lista).
//
// Honestidad sobre el alcance: NO es una lista de filtraciones reales (la de «Have I Been Pwned» tiene cientos de
// millones y se consulta a un tercero). Es una lista LOCAL y corta, escrita aquí, de las palabras base más usadas en
// español e inglés, más tres reglas que atrapan lo que una lista corta no puede: variantes (Password2026!, P@ssw0rd),
// teclado en fila (qwertyuiop12) y repeticiones (abcabcabcabc). Con mínimo de 12 caracteres, casi todo lo comunente
// llega como «palabra base + números/símbolos», y eso sí lo cubre.

/** Palabras base muy usadas. Se comparan ya normalizadas (minúsculas, sin acentos, sin trampa de «leet»). */
const COMMON_WORDS: ReadonlySet<string> = new Set([
  'password', 'passw0rd', 'pass', 'passcode', 'contrasena', 'clave', 'secreto', 'secret', 'admin', 'administrator',
  'root', 'user', 'usuario', 'login', 'welcome', 'bienvenido', 'bienvenida', 'letmein', 'master', 'superman',
  'batman', 'spiderman', 'iloveyou', 'teamo', 'tequiero', 'teamomucho', 'loveyou', 'princess', 'princesa', 'dragon',
  'monkey', 'mono', 'shadow', 'sombra', 'sunshine', 'football', 'futbol', 'soccer', 'baseball', 'basketball',
  'basquetbol', 'america', 'chivas', 'pumas', 'cruzazul', 'barcelona', 'realmadrid', 'mexico', 'queretaro',
  'colombia', 'argentina', 'michael', 'jordan', 'jennifer', 'daniel', 'alejandro', 'fernando', 'carlos', 'miguel',
  'maria', 'jessica', 'ashley', 'nicole', 'andrea', 'sofia', 'valentina', 'camila', 'angel', 'ángel', 'diablo',
  'trustno1', 'abc123', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'azerty', 'qazwsx',
  'qazwsxedc', 'wasd', 'changeme', 'cambiame', 'cambia', 'default', 'guest', 'invitado', 'test', 'testing', 'prueba',
  'demo', 'example', 'ejemplo', 'temporal', 'temporary', 'nuevo', 'newpassword', 'nuevaclave', 'nuevacontrasena',
  'mypassword', 'micontrasena', 'miclave', 'internet', 'computer', 'computadora', 'laptop', 'windows', 'linux',
  'google', 'facebook', 'whatsapp', 'instagram', 'youtube', 'netflix', 'amazon', 'apple', 'samsung', 'starwars',
  'pokemon', 'naruto', 'goku', 'minecraft', 'fortnite', 'harrypotter', 'matrix', 'freedom', 'libertad', 'whatever',
  'cualquiera', 'hello', 'hola', 'holamundo', 'helloworld', 'mundo', 'amor', 'love', 'lovely', 'family', 'familia',
  'friend', 'amigos', 'forever', 'siempre', 'summer', 'verano', 'winter', 'invierno', 'primavera', 'otono',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre',
  'diciembre', 'atalaya', 'dvloprbn',
]);

/** Filas del teclado (español y QWERTY) en ambos sentidos: «qwertyuiop12» es «qwertyuiop» más números. */
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'qazwsxedcrfvtgb', 'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz', '0987654321'];

/**
 * Deshace los cambios de letra por número o símbolo que casi todo el mundo hace («P@ssw0rd» → «password»).
 * El 1 vale «i» o «l»: se prueba como las dos.
 */
function unLeet(s: string): string[] {
  const base = s
    .replace(/0/g, 'o').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/@/g, 'a').replace(/\$/g, 's');
  return [base.replace(/[1!|]/g, 'i'), base.replace(/[1!|]/g, 'l')];
}

/** minúsculas y sin acentos («Contraseña» → «contrasena»). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Quita lo que va pegado AL FINAL de la palabra base: números, años y signos («password2026!!» → «password»). */
function stripTail(s: string): string {
  return s.replace(/[\d\W_]+$/u, '');
}

/** ¿Todo el texto es una secuencia consecutiva («abcdefghijkl», «987654321098») o el mismo carácter repetido? */
function isRunOrRepeat(s: string): boolean {
  if (s.length < 4) return false;
  if (new Set(s).size === 1) return true;
  const steps = [...s].slice(1).map((c, i) => c.charCodeAt(0) - s.charCodeAt(i));
  if (steps.every((d) => d === 1) || steps.every((d) => d === -1)) return true;
  // Solo dígitos: la secuencia da la vuelta («…7890123» y «…3210987»), así que se compara módulo 10.
  if (/^\d+$/.test(s)) {
    const mod = steps.map((d) => (((d % 10) + 10) % 10));
    if (mod.every((d) => d === 1) || mod.every((d) => d === 9)) return true;
  }
  // Un bloque corto que se repite entero: «abcabcabcabc», «1212121212», «holahola».
  for (let size = 1; size <= s.length / 2; size++) {
    if (s.length % size === 0 && s.slice(0, size).repeat(s.length / size) === s) return true;
  }
  return false;
}

/** El texto, salvo números y signos al final, es una fila del teclado o un trozo largo de ella. */
function isKeyboardWalk(letters: string): boolean {
  return letters.length >= 6 && KEYBOARD_ROWS.some((row) => row.includes(letters));
}

export function isCommonPassword(password: string): boolean {
  const lowered = fold(password);
  const alnum = lowered.replace(/[\W_]+/gu, ''); // sin espacios ni guiones: «mi-clave-1234» también cuenta

  if (isRunOrRepeat(alnum) || isKeyboardWalk(stripTail(alnum)) || isKeyboardWalk(alnum)) return true;

  // Primero se quita la cola («2026!»), DESPUÉS se deshace el «leet»: si fuera al revés, el año «2026» se volvería
  // «2o26» y la palabra base quedaría con letras pegadas («P@ssw0rd2026!» se escaparía). Se prueba también sin quitar nada.
  for (const base of [lowered, stripTail(lowered)]) {
    for (const variant of [base, ...unLeet(base)]) {
      const compact = variant.replace(/[\W_]+/gu, '');
      if (COMMON_WORDS.has(compact) || COMMON_WORDS.has(stripTail(compact))) return true;
      if (isRunOrRepeat(stripTail(compact))) return true;
    }
  }
  return false;
}
