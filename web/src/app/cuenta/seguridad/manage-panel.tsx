'use client';
import { useState } from 'react';
import { api, type RecoveryCodes, type TwoFactorStatus } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';
import { RecoveryCodes as CodesView } from './recovery-codes';

/** Con el 2FA activo: ver cuántos códigos quedan, pedir códigos nuevos o desactivarlo. Todo pide contraseña Y código. */
export function ManagePanel({ status, onChanged }: { status: TwoFactorStatus; onChanged: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null);

  const regenerate = useForm(async ({ password, code }) => {
    const res = await api.post<RecoveryCodes>('/api/auth/2fa/recovery-codes', { password, code });
    if (res.ok && res.data) setCodes(res.data.recoveryCodes);
    return res;
  });

  const disable = useForm(async ({ password, code }) => {
    const res = await api.post('/api/auth/2fa/disable', { password, code });
    if (res.ok) onChanged();
    return res;
  });

  if (codes) return <CodesView codes={codes} onDone={() => (setCodes(null), onChanged())} />;

  const low = status.recoveryCodesLeft <= 3;
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="estado2fa">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="estado2fa">Verificación en dos pasos</h2>
          <span className="chip" data-state="ok">activa</span>
        </div>
        <p className={low ? undefined : 'muted'} role={low ? 'alert' : undefined}>
          Te quedan {status.recoveryCodesLeft} de 10 códigos de recuperación{low ? ': genera códigos nuevos pronto.' : '.'}
        </p>
      </section>

      <section className="card stack" aria-labelledby="regenerar">
        <h2 id="regenerar">Códigos de recuperación nuevos</h2>
        <p className="muted">Los anteriores dejan de servir. Pide tu contraseña y un código.</p>
        <Credentials form={regenerate} button="Generar códigos nuevos" />
      </section>

      <section className="card stack" aria-labelledby="desactivar">
        <h2 id="desactivar">Desactivar</h2>
        <p className="muted">Tu cuenta quedará protegida solo por la contraseña. Pide tu contraseña y un código.</p>
        <Credentials form={disable} button="Desactivar el 2FA" />
      </section>
    </div>
  );
}

function Credentials({ form, button }: { form: ReturnType<typeof useForm>; button: string }) {
  return (
    <form onSubmit={form.onSubmit} className="row" style={{ alignItems: 'flex-end' }}>
      <label>
        Contraseña
        <input name="password" type="password" required maxLength={128} autoComplete="current-password" />
      </label>
      <label>
        Código (de la app o de recuperación)
        <input name="code" required minLength={6} maxLength={32} autoComplete="one-time-code" spellCheck={false} />
      </label>
      <button className="secondary" disabled={form.busy}>{button}</button>
      {form.result && !form.result.ok && <p role="alert" style={{ flexBasis: '100%' }}>{form.result.message}</p>}
    </form>
  );
}
