// Herramientas comunes de las pruebas del login con Google (sistema vivo + servidor OAuth falso).
//
// OJO: todo va por `localhost`, no `127.0.0.1`: el regreso de Google es a localhost y la cookie que
// ata el intento al navegador es de UN host. Un navegador real hace exactamente lo mismo.
import { expect } from 'vitest';

export const APP = (process.env.ATALAYA_URL ?? 'http://127.0.0.1:3070').replace('127.0.0.1', 'localhost');
export const ACCESS = '__Host-atalaya_access';
export const BINDING = '__Host-atalaya_oauth';

/** El "navegador" del intento: guarda las cookies que recibe y las manda de vuelta. */
export class Jar {
  readonly cookies = new Map<string, string>();
  absorb(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      if (rest.join('=') === '' || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, rest.join('='));
    }
  }
  header = () => [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  get hasSession() {
    return this.cookies.has(ACCESS);
  }
}

/** Una petición SIN seguir redirecciones: cada salto se ve y se comprueba. */
export async function hop(url: string, jar?: Jar) {
  const res = await fetch(url, { redirect: 'manual', headers: jar ? { cookie: jar.header() } : {} });
  jar?.absorb(res);
  return { status: res.status, location: res.headers.get('location') ?? '', setCookies: res.headers.getSetCookie() };
}

/** Un intento completo: empezar, "elegir cuenta" en el servidor falso y volver. `x` son las palancas x_* del servidor falso. */
export async function flow(x: Record<string, string>, opts: { jar?: Jar; callbackExtra?: string } = {}) {
  const jar = opts.jar ?? new Jar();
  const start = await hop(`${APP}/api/auth/google/start`, jar);
  expect(start.status).toBe(302);
  const auth = new URL(start.location);
  for (const [k, v] of Object.entries(x)) auth.searchParams.set(k, v);
  const approved = await hop(auth.toString());
  const callbackUrl = approved.location + (opts.callbackExtra ?? '');
  return { jar, start, auth, callbackUrl, done: await hop(callbackUrl, jar) };
}

export const meOf = async (jar: Jar) => {
  const res = await fetch(`${APP}/api/auth/me`, { headers: { cookie: jar.header() } });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};
export const FAILED = '/login?error=google';
