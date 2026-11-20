'use client';
import { useState } from 'react';
import type { components } from '@/lib/api-schema';
import { api } from '@/lib/browser-api';
import { useForm } from '@/lib/use-form';

type AdminUser = components['schemas']['AdminUser'];

// S-10 · La celda «2FA» de una cuenta en el panel de admin: su estado y la recuperación asistida.
// El formulario está COMPLETO desde el principio (motivo, tu contraseña y tu código): no hay «pide y luego confirma».
// El servidor decide todo (jerarquía, que tengas tu propio 2FA, que no haya otra pendiente); aquí solo se muestra.
export function TwoFactorCell({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const request = useForm(async ({ reason, password, code }) => {
    const res = await api.post(`/api/admin/users/${user.id}/two-factor-reset`, { reason, password, code });
    if (res.ok) {
      setOpen(false);
      onChanged();
    }
    return res;
  });

  async function cancel() {
    const res = await api.delete(`/api/admin/users/${user.id}/two-factor-reset`);
    setCancelError(res.ok ? null : (res.message ?? 'No se pudo.'));
    onChanged();
  }

  if (user.twoFactor === 'off') return <span className="chip">sin 2FA</span>;

  if (user.twoFactor === 'reset_pending') {
    const when = user.twoFactorResetAt ? new Date(user.twoFactorResetAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return (
      <div className="stack">
        <span className="chip" data-state="down">se quita el {when}</span>
        <button className="secondary" onClick={() => void cancel()}>Cancelar solicitud</button>
        {cancelError && <span role="alert">{cancelError}</span>}
      </div>
    );
  }

  return (
    <div className="stack">
      <span className="chip" data-state="ok">2FA activo</span>
      {!open ? (
        <button className="secondary" onClick={() => setOpen(true)}>Restablecer 2FA…</button>
      ) : (
        <form onSubmit={request.onSubmit} className="stack" aria-label={`Restablecer el 2FA de ${user.email}`}>
          <p className="muted">
            Solo si perdió el teléfono <strong>y</strong> sus códigos de recuperación, y verificaste que es la persona por un
            medio que ya conocías (no el que usó para pedirlo). Se aplica a las 48 h; a la persona le llega un correo para cancelarlo.
          </p>
          <label>
            Cómo verificaste su identidad
            <textarea name="reason" required minLength={10} maxLength={200} rows={2} />
          </label>
          <label>
            Tu contraseña
            <input name="password" type="password" required maxLength={128} autoComplete="current-password" />
          </label>
          <label>
            Tu código (de tu app o de recuperación)
            <input name="code" required minLength={6} maxLength={32} autoComplete="one-time-code" spellCheck={false} />
          </label>
          <div className="row">
            <button disabled={request.busy}>Pedir el restablecimiento</button>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>Cerrar</button>
          </div>
          {request.result && !request.result.ok && <p role="alert">{request.result.message}</p>}
        </form>
      )}
    </div>
  );
}
