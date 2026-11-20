'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import type { components } from '@/lib/api-schema';
import { api } from '@/lib/browser-api';
import { SessionProblem, useMe } from '@/lib/use-me';
import { useForm } from '@/lib/use-form';
import { UserRow } from './user-row';

type AdminUserPage = components['schemas']['AdminUserPage'];
type AssignableRole = components['schemas']['AssignableRole'];
const ADMIN_LEVEL = 3;

// Panel de administración de cuentas. La pantalla es solo un esqueleto: TODA
// regla (quién ve a quién, qué rol se puede asignar) la aplica la API. Esta
// página solo pregunta y muestra lo que la API responde.
export default function AdminPage() {
  const router = useRouter();
  const { user: me, failed, retry } = useMe();
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [page, setPage] = useState<AdminUserPage | null>(null);
  const [query, setQuery] = useState('');

  // Siempre se vuelve a leer del servidor tras una acción: la pantalla nunca
  // muestra un cambio que el servidor no confirmó (lección 26).
  const reload = useCallback(async (q = query) => {
    const res = await api.get<AdminUserPage>(`/api/admin/users?q=${encodeURIComponent(q)}`);
    if (res.ok && res.data) setPage(res.data);
  }, [query]);

  useEffect(() => {
    if (!me) return;
    if (me.role.level < ADMIN_LEVEL) return router.replace('/cuenta');
    void (async () => {
      const r = await api.get<AssignableRole[]>('/api/admin/roles');
      if (r.ok && r.data) setRoles(r.data);
      await reload('');
    })();
    // Solo cuando se sabe quién es (`me`): las búsquedas recargan con su propio botón, por eso `reload` no va en la lista.
  }, [me, router]);

  const create = useForm(async ({ email, roleName }) => {
    const res = await api.post('/api/admin/users', { email, roleName });
    if (res.ok) await reload();
    return res;
  });

  if (failed) return <SessionProblem onRetry={retry} />;
  if (!me || me.role.level < ADMIN_LEVEL) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;

  return (
    <AppShell user={me}>
      <div className="stack" style={{ gap: 8 }}>
        <h1>Administración de cuentas</h1>
        <p className="muted">Solo ves y gestionas cuentas de nivel menor al tuyo ({me.role.name}).</p>
      </div>

      <section className="card stack" aria-labelledby="invitar">
      <h2 id="invitar">Invitar a una persona</h2>
      <form onSubmit={create.onSubmit} className="row" style={{ alignItems: 'flex-end' }}>
        <label>
          Correo <input name="email" type="email" required maxLength={254} />
        </label>{' '}
        <label>
          Rol{' '}
          <select name="roleName" defaultValue={roles[0]?.name}>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </label>{' '}
        <button disabled={create.busy}>Mandar invitación</button>
      </form>
      {create.result && <p role={create.result.ok ? 'status' : 'alert'}>{create.result.ok ? 'Invitación enviada.' : create.result.message}</p>}
      </section>

      <section className="card stack" aria-labelledby="cuentas">
      <h2 id="cuentas">Cuentas</h2>
      <form onSubmit={(e) => (e.preventDefault(), void reload())} className="row" style={{ alignItems: 'flex-end' }}>
        <label>
          Buscar por correo <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} />
        </label>{' '}
        <button className="secondary">Buscar</button>
      </form>
      {page && (
        <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th scope="col">Correo</th>
              <th scope="col">Rol</th>
              <th scope="col">Estado</th>
              <th scope="col">2FA</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((user) => (
              <UserRow key={user.id} user={user} roles={roles} onChanged={() => reload()} />
            ))}
          </tbody>
        </table>
        </div>
      )}
      {page && <p className="mono muted">{page.total} cuenta(s)</p>}
      </section>
    </AppShell>
  );
}
