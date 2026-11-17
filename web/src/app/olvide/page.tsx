'use client';
import { AuthShell } from '@/components/auth-shell';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

export default function ForgotPasswordPage() {
  const { busy, result, onSubmit } = useForm(({ email }) => api.post('/api/auth/forgot-password', { email }));

  return (
    <AuthShell>
      <div className="stack">
        <h1>¿Olvidaste tu contraseña?</h1>
        <p className="muted">Te mandamos un enlace para elegir una nueva. Vence en 1 hora.</p>
      </div>
      {result?.ok ? (
        // Mismo mensaje exista o no la cuenta.
        <p role="status">{result.message}</p>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <label>
            Correo
            <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="tu@correo.com" />
          </label>
          <button disabled={busy}>Mandarme un enlace</button>
          {result && !result.ok && <p role="alert">{result.message}</p>}
        </form>
      )}
      <a href="/login" style={{ fontSize: 14 }}>
        Volver a iniciar sesión
      </a>
    </AuthShell>
  );
}
