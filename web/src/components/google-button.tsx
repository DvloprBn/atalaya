'use client';
import { useEffect, useState } from 'react';
import { api, type Providers } from '@/lib/browser-api';

/**
 * «Continuar con Google». Solo aparece si el servidor lo tiene configurado (GET /api/auth/providers).
 * Es un ENLACE normal (<a>), no una llamada de JavaScript: el navegador debe hacer la navegación
 * completa a Google, y de ahí regresar a Atalaya por su cuenta.
 */
export function GoogleButton() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void api.get<Providers>('/api/auth/providers').then((res) => setEnabled(Boolean(res.ok && res.data?.google)));
  }, []);

  if (!enabled) return null;
  return (
    <div className="stack">
      <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>o</p>
      <a className="button secondary" href="/api/auth/google/start">
        Continuar con Google
      </a>
    </div>
  );
}
