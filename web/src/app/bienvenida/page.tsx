'use client';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';
import { useUrlToken } from '@/lib/use-url-token';

// Página del enlace de invitación: la persona elige SU contraseña (nadie más la conoce).
export default function WelcomePage() {
  const token = useUrlToken();
  const { busy, result, onSubmit } = useForm(({ password }) => api.post('/api/auth/accept-invite', { token, password }));

  if (token === null) {
    return (
      <main>
        <h1>Activar cuenta</h1>
        <p>Este enlace no trae un código. Pide a quien te invitó que te mande otro.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Elige tu contraseña</h1>
      {result?.ok ? (
        <p role="status">
          {result.message} <a href="/login">Iniciar sesión</a>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <p>
            <label>
              Contraseña (mínimo 12 caracteres){' '}
              <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
            </label>
          </p>
          <button disabled={busy || !token}>Activar mi cuenta</button>
        </form>
      )}
      {result && !result.ok && <p role="alert">{result.message}</p>}
    </main>
  );
}
