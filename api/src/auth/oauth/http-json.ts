import { OAuthError } from './oauth-error.js';

// Todo lo que llega del proveedor es NO CONFIABLE (OWASP API10): se llama con tiempo límite,
// sin seguir redirecciones, con tope de tamaño y se exige que sea JSON. Las URLs salen de la
// configuración, nunca de lo que escribe un visitante (así no hay SSRF, OWASP API7).

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 64 * 1024;

async function request(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    // redirect: 'error' → una redirección (por ejemplo a una dirección interna) falla en vez de seguirse.
    res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new OAuthError('upstream');
  }
  if (!res.ok || !res.headers.get('content-type')?.includes('json') || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new OAuthError('upstream');
  }
  // Se lee por trozos y se corta al pasar el tope: un cuerpo gigante no llena la memoria.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new OAuthError('upstream');
    }
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new OAuthError('upstream');
    }
    chunks.push(chunk.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new OAuthError('upstream');
  }
}

export const getJson = (url: string): Promise<unknown> => request(url, { headers: { accept: 'application/json' } });

export const postForm = (url: string, fields: Record<string, string>): Promise<unknown> =>
  request(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
