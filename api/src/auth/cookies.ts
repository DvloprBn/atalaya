import type { CookieOptions, Response } from 'express';

// Dos cookies, las dos httpOnly (JavaScript del navegador no las puede leer: un XSS no las roba).
//
// __Host-  → el navegador SOLO la acepta con Secure, Path=/ y sin Domain: no la
//            puede pisar un subdominio (los casos de estudio viven en subdominios, lección 66).
// __Secure- → exige Secure pero permite una ruta: el refresh solo viaja a /api/auth,
//            nunca a las demás rutas de la API. Menos viajes = menos exposición.
export const ACCESS_COOKIE = '__Host-atalaya_access';
export const REFRESH_COOKIE = '__Secure-atalaya_refresh';
const REFRESH_PATH = '/api/auth';

// Secure también en local: los navegadores (y curl) tratan http://localhost como seguro.
// SameSite=Strict: otro sitio no puede hacer que el navegador las mande (CSRF).
const BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' };

export interface SessionCookies {
  access: string;
  refresh: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

export function setSessionCookies(res: Response, tokens: SessionCookies): void {
  res.cookie(ACCESS_COOKIE, tokens.access, { ...BASE, path: '/', maxAge: tokens.accessMaxAgeMs });
  res.cookie(REFRESH_COOKIE, tokens.refresh, { ...BASE, path: REFRESH_PATH, maxAge: tokens.refreshMaxAgeMs });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...BASE, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...BASE, path: REFRESH_PATH });
}
