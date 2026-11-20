'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { api, type ApiResult } from '@/lib/browser-api';
import { useUrlToken } from '@/lib/use-url-token';

export default function VerifyPage() {
  const token = useUrlToken();
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);
  // En desarrollo React ejecuta los efectos DOS veces a propósito (modo estricto).
  // El enlace es de un solo uso: sin esta marca, la segunda llamada diría "ya usado".
  const sent = useRef(false);

  const confirm = useCallback(() => {
    if (!token) return;
    setResult(null);
    void api.post('/api/auth/verify-email', { token }).then(setResult);
  }, [token]);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    confirm();
  }, [token, confirm]);

  if (token === null) return <Screen message="Este enlace no trae un código de verificación." />;
  if (!result) return <Screen message="Confirmando tu correo…" />;
  // v1.0 · Demo llena (503): el enlace NO se gastó, así que se puede reintentar con él mismo más tarde.
  if (result.status === 503) return <Screen message={result.message ?? ''} onRetry={confirm} />;
  return <Screen message={result.message ?? ''} done={result.ok} />;
}

function Screen({ message, done = false, onRetry }: { message: string; done?: boolean; onRetry?: () => void }) {
  return (
    <AuthShell>
      <div className="stack">
        <h1>Confirmar correo</h1>
        <p role="status">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Reintentar con este enlace
          </button>
        ) : done ? (
          <a href="/login">Iniciar sesión →</a>
        ) : (
          <a href="/registro">Volver a registrarme</a>
        )}
      </div>
    </AuthShell>
  );
}
