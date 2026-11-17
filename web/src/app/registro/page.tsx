'use client';
import { AuthShell } from '@/components/auth-shell';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

export default function RegisterPage() {
  const { busy, result, onSubmit } = useForm(({ email, password }) => api.post('/api/auth/register', { email, password }));

  // Tras enviar, la pantalla dice lo mismo exista o no la cuenta: el resultado
  // real le llega al dueño del correo, por correo (sin enumeración).
  if (result?.ok) {
    return (
      <AuthShell>
        <div className="stack">
          <h1>Revisa tu correo</h1>
          <p role="status">{result.message}</p>
          <p className="muted">El enlace vence en 24 horas. En desarrollo, los correos llegan a Mailpit: http://localhost:3071</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="stack">
        <h1>Crear una cuenta</h1>
        <p className="muted">Atalaya es un proyecto de estudio: usa solo datos de prueba.</p>
      </div>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Correo
          <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="tu@correo.com" />
        </label>
        <label>
          Contraseña (mínimo 12 caracteres; una frase sirve)
          <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
        </label>
        <button disabled={busy}>Crear cuenta</button>
        {result && !result.ok && <p role="alert">{result.message}</p>}
      </form>
      <p style={{ fontSize: 14 }}>
        ¿Ya tienes cuenta? <a href="/login">Inicia sesión</a>
      </p>
    </AuthShell>
  );
}
