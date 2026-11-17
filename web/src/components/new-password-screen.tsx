'use client';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';
import { useUrlToken } from '@/lib/use-url-token';
import { AuthShell } from './auth-shell';

/**
 * Pantalla de "elige una contraseña" que comparten dos enlaces de correo:
 * restablecer (/restablecer) y aceptar una invitación (/bienvenida).
 * Solo cambian los textos y la ruta de la API a la que se manda.
 */
export function NewPasswordScreen(props: { endpoint: string; title: string; button: string; noToken: string }) {
  const token = useUrlToken();
  const { busy, result, onSubmit } = useForm(({ password }) => api.post(props.endpoint, { token, password }));

  if (token === null) {
    return (
      <AuthShell>
        <div className="stack">
          <h1>{props.title}</h1>
          <p>{props.noToken}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>{props.title}</h1>
      {result?.ok ? (
        <p role="status">
          {result.message} <a href="/login">Iniciar sesión →</a>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <label>
            Contraseña nueva (mínimo 12 caracteres)
            <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
          </label>
          <button disabled={busy || !token}>{props.button}</button>
          {result && !result.ok && <p role="alert">{result.message}</p>}
        </form>
      )}
    </AuthShell>
  );
}
