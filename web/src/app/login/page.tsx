'use client';
import { useRouter } from 'next/navigation';
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
    <main>
      <h1>Iniciar sesión</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label>
            Correo <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
        </p>
        <p>
          <label>
            Contraseña <input name="password" type="password" required maxLength={128} autoComplete="current-password" />
          </label>
        </p>
        <button disabled={busy}>Entrar</button>
      </form>
      {result && !result.ok && <p role="alert">{result.message}</p>}
      <p>
        <a href="/olvide">¿Olvidaste tu contraseña?</a> · <a href="/registro">Crear una cuenta</a>
      </p>
    </main>
  );
}
