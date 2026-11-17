'use client';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';
import { useUrlToken } from '@/lib/use-url-token';

export default function ResetPasswordPage() {
  const token = useUrlToken();
  const { busy, result, onSubmit } = useForm(({ password }) =>
    api.post('/api/auth/reset-password', { token, password }),
  );

  if (token === null) {
    return (
      <main>
        <h1>Restablecer contraseña</h1>
        <p>Este enlace no trae un código. <a href="/olvide">Pide uno nuevo</a>.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Elige una contraseña nueva</h1>
      {result?.ok ? (
        <p role="status">
          {result.message} <a href="/login">Iniciar sesión</a>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <p>
            <label>
              Contraseña nueva (mínimo 12 caracteres){' '}
              <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
            </label>
          </p>
          <button disabled={busy || !token}>Guardar</button>
        </form>
      )}
      {result && !result.ok && <p role="alert">{result.message}</p>}
    </main>
  );
}
