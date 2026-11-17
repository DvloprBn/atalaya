'use client';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

export default function RegisterPage() {
  const { busy, result, onSubmit } = useForm(({ email, password }) =>
    api.post('/api/auth/register', { email, password }),
  );

  // Tras enviar, la pantalla dice lo mismo exista o no la cuenta: el resultado
  // real le llega al dueño del correo, por correo (sin enumeración).
  if (result?.ok) {
    return (
      <main>
        <h1>Revisa tu correo</h1>
        <p role="status">{result.message}</p>
        <p>El enlace vence en 24 horas. En desarrollo, los correos llegan a Mailpit: http://localhost:3071</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Crear una cuenta</h1>
      <p>Atalaya es un proyecto de estudio: usa solo datos de prueba.</p>
      <form onSubmit={onSubmit}>
        <p>
          <label>
            Correo <input name="email" type="email" required maxLength={254} autoComplete="email" />
          </label>
        </p>
        <p>
          <label>
            Contraseña (mínimo 12 caracteres; una frase sirve){' '}
            <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
          </label>
        </p>
        <button disabled={busy}>Crear cuenta</button>
      </form>
      {result && !result.ok && <p role="alert">{result.message}</p>}
      <p>
        ¿Ya tienes cuenta? <a href="/login">Inicia sesión</a>
      </p>
    </main>
  );
}
