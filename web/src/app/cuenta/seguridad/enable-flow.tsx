'use client';
import { useState } from 'react';
import { api, type RecoveryCodes, type TwoFactorSetup } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';
import { RecoveryCodes as CodesView } from './recovery-codes';
import styles from './seguridad.module.css';

/** Activar el 2FA en tres pasos: contraseña → escanear y confirmar con un código → guardar los códigos. */
export function EnableFlow({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const start = useForm(async ({ password }) => {
    const res = await api.post<TwoFactorSetup>('/api/auth/2fa/setup', { password });
    if (res.ok && res.data) setSetup(res.data);
    return res;
  });

  const confirm = useForm(async ({ code }) => {
    const res = await api.post<RecoveryCodes>('/api/auth/2fa/enable', { code });
    if (res.ok && res.data) setCodes(res.data.recoveryCodes);
    return res;
  });

  // El padre solo se entera al final: si se enterara antes, esta pantalla se cerraría y los códigos se perderían.
  if (codes) return <CodesView codes={codes} onDone={onDone} />;

  if (setup) {
    return (
      <section className="card stack" aria-labelledby="escanear">
        <h2 id="escanear">Enlaza tu app de autenticación</h2>
        <div className={styles.steps}>
          <div className="stack">
            <p className="muted">1. En tu app (Google Authenticator, Authy, 1Password…) agrega una cuenta y escanea el QR.</p>
            {/* El QR llega como SVG: se muestra dentro de un <img>, donde ningún script puede ejecutarse. */}
            <img
              className={styles.qr}
              alt="Código QR para tu app de autenticación"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
            />
            <p className="muted">¿No puedes escanear? Escribe esta clave a mano:</p>
            <p className={styles.secret} aria-label="Clave para escribir a mano">{setup.secret}</p>
          </div>
          <form onSubmit={confirm.onSubmit} className="stack">
            <p className="muted">2. Escribe el código de 6 dígitos que muestra la app para confirmar.</p>
            <label>
              Código de 6 dígitos
              <input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" />
            </label>
            <button disabled={confirm.busy}>Activar</button>
            {confirm.result && !confirm.result.ok && <p role="alert">{confirm.result.message}</p>}
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack" aria-labelledby="activar">
      <h2 id="activar">Verificación en dos pasos</h2>
      <p className="muted">
        Además de tu contraseña, Atalaya pedirá un código que genera tu teléfono. Aunque alguien robe tu contraseña, no
        podrá entrar.
      </p>
      <form onSubmit={start.onSubmit} className="row" style={{ alignItems: 'flex-end' }}>
        <label>
          Confirma tu contraseña
          <input name="password" type="password" required maxLength={128} autoComplete="current-password" />
        </label>
        <button disabled={start.busy}>Empezar</button>
      </form>
      {start.result && !start.result.ok && <p role="alert">{start.result.message}</p>}
    </section>
  );
}
