// Cliente de la API para el NAVEGADOR (componentes 'use client').
// Las cookies de sesión son httpOnly: este código nunca las ve; el navegador
// las manda solo porque la API vive en el mismo sitio (/api).
//
// Uso:  const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
//       if (res.ok) … else mostrar(res.message)
import type { components } from './api-schema';

export type PublicUser = components['schemas']['PublicUser'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type Providers = components['schemas']['Providers'];
export type TwoFactorStatus = components['schemas']['TwoFactorStatus'];
export type TwoFactorSetup = components['schemas']['TwoFactorSetup'];
export type RecoveryCodes = components['schemas']['RecoveryCodes'];
export type Upload = components['schemas']['Upload'];
export type UploadPage = components['schemas']['UploadPage'];
export type AdminUploadPage = components['schemas']['AdminUploadPage'];
type ApiError = components['schemas']['Error'];

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  /** Mensaje listo para mostrar (el de la API o uno genérico). */
  message?: string;
}

// Solo estas rutas usan la sesión y se reintentan tras renovarla. Las demás de /api/auth
// (login, registro, la propia renovación…) no dependen de una sesión. El 2FA es de sesión, salvo
// `verify`, que es la que la CREA (un 401 ahí es "código incorrecto", no "acceso vencido").
const NEEDS_SESSION = (path: string) =>
  !path.startsWith('/api/auth/') ||
  path === '/api/auth/me' ||
  (path.startsWith('/api/auth/2fa') && path !== '/api/auth/2fa/verify');

let refreshing: Promise<boolean> | null = null;

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<ApiResult<T>> {
  let res = await send(method, path, body);
  // El acceso dura 10 min. Si venció (401), se pide UNA renovación y se repite una vez.
  // Varias llamadas a la vez comparten la misma renovación: si cada una renovara por
  // su cuenta, reusarían el mismo refresh y la API lo tomaría como robo.
  if (res.status === 401 && NEEDS_SESSION(path)) {
    refreshing ??= send('POST', '/api/auth/refresh')
      .then((r) => r.ok)
      .finally(() => (refreshing = null));
    if (await refreshing) res = await send(method, path, body);
  }
  return toResult<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /** Subida de un archivo (multipart). El navegador pone el content-type con su límite; NO se fija a mano. */
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

function send(method: string, path: string, body?: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  return fetch(path, {
    method,
    headers: body === undefined || isForm ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    credentials: 'same-origin',
    // Toda llamada de red lleva tiempo límite; una subida de hasta 5 MB necesita más que un formulario.
    signal: AbortSignal.timeout(isForm ? 30_000 : 10_000),
  });
}

async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (res.ok) {
    return { ok: true, status: res.status, data: data as T, message: (data as { message?: string })?.message };
  }
  return { ok: false, status: res.status, message: errorMessage(res.status, data as ApiError | undefined) };
}

function errorMessage(status: number, error?: ApiError): string {
  if (status === 413) return 'El archivo pasa de 5 MB.';
  if (status === 429) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  if (status >= 500 || !error) return 'Algo salió mal. Intenta de nuevo.';
  return Array.isArray(error.message) ? error.message.join('. ') : error.message;
}
