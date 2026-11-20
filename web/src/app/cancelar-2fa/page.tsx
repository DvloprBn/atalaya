'use client';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { api, type ApiResult } from '@/lib/browser-api';
import { useUrlToken } from '@/lib/use-url-token';

// S-10 · La persona llega aquí desde el correo «Se pidió quitar tu verificación en dos pasos».
// Cancelar es un BOTÓN, a propósito: abrir el enlace no cancela nada. Los filtros de correo y los antivirus abren
// los enlaces solos; si bastara con abrirlo, cancelarían todas las solicitudes, también las legítimas.
export default function CancelTwoFactorResetPage() {
  const token = useUrlToken();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);

  async function cancel() {
    if (!token || busy) return;
    setBusy(true);
    setResult(await api.post('/api/auth/two-factor-reset/cancel', { token }));
    setBusy(false);
  }

  return (
    <AuthShell>
      <div className="stack">
        <h1>¿No pediste quitar tu 2FA?</h1>
        {token === null ? (
          <p role="status">Este enlace no trae un código. Ábrelo desde el botón del correo.</p>
        ) : result ? (
          <p role="status">{result.message}</p>
        ) : (
          <>
            <p>
              Un administrador pidió quitar la verificación en dos pasos de tu cuenta. Si no fuiste tú quien lo pidió,
              alguien intenta entrar haciéndose pasar por ti: cancélalo. Tu 2FA seguirá como está y no cambia nada más.
            </p>
            <button onClick={() => void cancel()} disabled={busy || token === undefined}>
              No lo pedí: cancelar
            </button>
          </>
        )}
        <a href="/login">Ir a iniciar sesión →</a>
      </div>
    </AuthShell>
  );
}
