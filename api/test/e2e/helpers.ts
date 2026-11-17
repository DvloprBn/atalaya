// Herramientas de las pruebas e2e: hablan con el sistema VIVO (Docker), igual que un navegador.
//   ATALAYA_URL  → Caddy (http://127.0.0.1:3070)
//   MAILPIT_URL  → la bandeja de correos falsos (http://127.0.0.1:3071)

// No se llama BASE_URL: Vitest (por Vite) ya define esa variable como "/".
export const BASE_URL = process.env.ATALAYA_URL ?? 'http://127.0.0.1:3070';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:3071';

export interface ApiResponse {
  status: number;
  body: any;
}

/** Un "navegador" mínimo: guarda las cookies que la API pone y las manda de vuelta. */
export class Browser {
  readonly cookies = new Map<string, string>();

  async post(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> {
    return this.request('POST', path, body, headers);
  }

  async get(path: string): Promise<ApiResponse> {
    return this.request('GET', path);
  }

  /** Copia de las cookies de este momento (para "robarlas" en las pruebas). */
  snapshot(): Map<string, string> {
    return new Map(this.cookies);
  }

  private async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      // clearCookie manda la cookie vacía con fecha vencida: se borra.
      if (value === '' || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/**
 * Espera a que llegue a Mailpit un correo para `to` cuyo asunto contenga `subject`
 * y devuelve su texto. El despachador de la API manda la bandeja cada 5 s.
 */
export async function waitForMail(to: string, subject: string, timeoutMs = 30_000): Promise<string> {
  const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)).json();
    const first = found.messages?.[0];
    if (first) {
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${first.ID}`)).json();
      return message.Text as string;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No llegó el correo "${subject}" a ${to}`);
}

/** El token del enlace de un correo (?token=...). */
export function tokenFrom(mailText: string): string {
  const match = /token=([A-Za-z0-9_-]{43})/.exec(mailText);
  if (!match) throw new Error('El correo no trae un enlace con token');
  return match[1];
}
