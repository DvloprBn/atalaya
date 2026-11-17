'use client';
import { useState } from 'react';
import type { components } from '@/lib/api-schema';
import { api } from '@/lib/browser-api';

type AdminUser = components['schemas']['AdminUser'];
type AssignableRole = components['schemas']['AssignableRole'];

/** Una fila: cambiar rol y desactivar/reactivar. Tras cada acción, la tabla se vuelve a leer del servidor. */
export function UserRow({ user, roles, onChanged }: { user: AdminUser; roles: AssignableRole[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function run(action: Promise<{ ok: boolean; message?: string }>) {
    const res = await action;
    setError(res.ok ? null : (res.message ?? 'No se pudo.'));
    onChanged(); // pase lo que pase, se muestra lo que dice el servidor
  }

  return (
    <tr>
      <td>{user.email}</td>
      <td>
        {/* `key` con el rol: si el servidor rechaza el cambio, el selector vuelve al valor real. */}
        <select
          key={user.role.name}
          defaultValue={user.role.name}
          aria-label={`Rol de ${user.email}`}
          onChange={(e) => void run(api.patch(`/api/admin/users/${user.id}/role`, { roleName: e.target.value }))}
        >
          {roles.map((r) => (
            <option key={r.name} value={r.name}>
              {r.name}
            </option>
          ))}
        </select>
      </td>
      <td>{{ active: 'activa', invited: 'invitada', disabled: 'desactivada' }[user.status]}</td>
      <td>
        {user.status === 'disabled' ? (
          <button onClick={() => void run(api.post(`/api/admin/users/${user.id}/enable`))}>Reactivar</button>
        ) : (
          <button onClick={() => void run(api.post(`/api/admin/users/${user.id}/disable`))}>Desactivar</button>
        )}
        {error && <span role="alert"> {error}</span>}
      </td>
    </tr>
  );
}
