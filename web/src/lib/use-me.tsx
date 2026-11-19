'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type PublicUser } from './browser-api';

/**
 * Quién es la persona de esta pantalla. Solo un 401 (la sesión no existe o no se pudo renovar) manda a /login.
 * Cualquier otra falla (un 429 por el tope, un 5xx, la red caída, el tiempo agotado) NO es «sesión inválida»:
 * sacar de la pantalla a quien sí la tiene era el defecto S-15. Se avisa con `failed` y se deja reintentar.
 */
export function useMe() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true; // si la pantalla se cierra a media llamada, la respuesta tardía no toca nada
    setFailed(false);
    api
      .get<PublicUser>('/api/auth/me')
      .then((res) => {
        if (!current) return;
        if (res.ok && res.data) setUser(res.data);
        else if (res.status === 401) router.replace('/login');
        else setFailed(true);
      })
      .catch(() => current && setFailed(true)); // fetch lanza (no devuelve) cuando se agota el tiempo o no hay red
    return () => {
      current = false;
    };
  }, [router, attempt]);

  return { user, failed, retry: () => setAttempt((n) => n + 1) };
}

/** Lo que se muestra cuando no se pudo comprobar la sesión por una falla que no es un 401. */
export function SessionProblem({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="stack" style={{ padding: 40 }}>
      <p role="alert">No se pudo comprobar tu sesión por un problema momentáneo. Tu sesión no se cerró.</p>
      <div className="row">
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
