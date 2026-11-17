'use client';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

export default function ForgotPasswordPage() {
  const { busy, result, onSubmit } = useForm(({ email }) => api.post('/api/auth/forgot-password', { email }));

  return (
    <main>
      <h1>¿Olvidaste tu contraseña?</h1>
      {result?.ok ? (
        // Mismo mensaje exista o no la cuenta.
        <p role="status">{result.message}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <p>
            <label>
              Correo <input name="email" type="email" required maxLength={254} autoComplete="email" />
            </label>
          </p>
          <button disabled={busy}>Mandarme un enlace</button>
        </form>
      )}
      {result && !result.ok && <p role="alert">{result.message}</p>}
      <p>
        <a href="/login">Volver a iniciar sesión</a>
      </p>
    </main>
  );
}
