'use client';
import { useEffect, useState } from 'react';

/**
 * Lee el token de un enlace de correo (?token=…) UNA vez y lo borra de la barra
 * de direcciones: así no queda en el historial ni se copia por accidente al
 * compartir la URL. (Caddy además manda Referrer-Policy: no-referrer en estas páginas.)
 *
 * Devuelve undefined mientras lee, null si no venía token.
 */
export function useUrlToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('token');
    if (value) window.history.replaceState(null, '', url.pathname);
    setToken((current) => current ?? value);
  }, []);

  return token;
}
