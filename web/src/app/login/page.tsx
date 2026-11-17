'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { api, type LoginResponse } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

export default function LoginPage() {
  const router = useRouter();
  // Con 2FA, la contraseña buena no abre sesión: devuelve un reto de un solo uso y la
  // pantalla pasa al segundo paso. El reto vive solo en memoria de esta pestaña.
  const [challenge, setChallenge] = useState<string | null>(null);

  const first = useForm(async ({ email, password }) => {
    const res = await api.post<LoginResponse>('/api/auth/login', { email, password });
    if (res.ok && res.data) {
      if ('twoFactorRequired' in res.data) setChallenge(res.data.challenge);
      else router.push('/cuenta');
    }
    return res;
  });

  const second = useForm(async ({ code }) => {
    const res = await api.post('/api/auth/2fa/verify', { challenge, code });
    if (res.ok) router.push('/cuenta');
    return res;
  });

  if (challenge) {
    return (
      <AuthShell>
        <div className="stack">
          <h1>Verificación en dos pasos</h1>
          <p className="muted">Escribe el código de 6 dígitos de tu app de autenticación, o uno de tus códigos de recuperación.</p>
        </div>
        {/* `key`: sin ella React reutiliza el <input> del primer formulario y arrastra lo escrito (el correo). */}
        <form key="paso-2" onSubmit={second.onSubmit} className="stack">
          <label>
            Código
            <input name="code" required minLength={6} maxLength={32} autoComplete="one-time-code" autoFocus spellCheck={false} />
          </label>
          <button disabled={second.busy}>Verificar</button>
          {second.result && !second.result.ok && <p role="alert">{second.result.message}</p>}
        </form>
        <button type="button" className="secondary" onClick={() => setChallenge(null)}>
          Empezar de nuevo
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="stack">
        <h1>Iniciar sesión</h1>
        <p className="muted">Entra al observatorio de tu negocio.</p>
      </div>
      <form key="paso-1" onSubmit={first.onSubmit} className="stack">
        <label>
          Correo
          <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="tu@correo.com" />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" required maxLength={128} autoComplete="current-password" />
        </label>
        <button disabled={first.busy}>Entrar</button>
        {first.result && !first.result.ok && <p role="alert">{first.result.message}</p>}
      </form>
      <p className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
        <a href="/olvide">¿Olvidaste tu contraseña?</a>
        <a href="/registro">Crear una cuenta</a>
      </p>
    </AuthShell>
  );
}
