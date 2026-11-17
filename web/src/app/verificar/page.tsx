'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type ApiResult } from '@/lib/browser-api';
import { useUrlToken } from '@/lib/use-url-token';

export default function VerifyPage() {
  const token = useUrlToken();
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);
  // En desarrollo React ejecuta los efectos DOS veces a propósito (modo estricto).
  // El enlace es de un solo uso: sin esta marca, la segunda llamada diría "ya usado".
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void api.post('/api/auth/verify-email', { token }).then(setResult);
  }, [token]);

  if (token === null) return <Page message="Este enlace no trae un código de verificación." />;
  if (!result) return <Page message="Confirmando tu correo…" />;
  return <Page message={result.message ?? ''} done={result.ok} />;
}

function Page({ message, done = false }: { message: string; done?: boolean }) {
  return (
    <main>
      <h1>Confirmar correo</h1>
      <p role="status">{message}</p>
      {done ? <a href="/login">Iniciar sesión</a> : <a href="/registro">Volver a registrarme</a>}
    </main>
  );
}
