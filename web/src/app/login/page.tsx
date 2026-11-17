'use client';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { api, type LoginResponse } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

export default function LoginPage() {
  const router = useRouter();
  const { busy, result, onSubmit } = useForm(async ({ email, password }) => {
    const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
    if (res.ok) router.push('/cuenta');
    return res;
  });

  return (
    <AuthShell>
      <div className="stack">
        <h1>Iniciar sesión</h1>
        <p className="muted">Entra al observatorio de tu negocio.</p>
      </div>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Correo
          <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="tu@correo.com" />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" required maxLength={128} autoComplete="current-password" />
        </label>
        <button disabled={busy}>Entrar</button>
        {result && !result.ok && <p role="alert">{result.message}</p>}
      </form>
      <p className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
        <a href="/olvide">¿Olvidaste tu contraseña?</a>
        <a href="/registro">Crear una cuenta</a>
      </p>
    </AuthShell>
  );
}
