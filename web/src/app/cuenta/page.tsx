'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type PublicUser } from '@/lib/browser-api';

// Página protegida. La protección REAL es la API: aunque alguien viera esta
// pantalla, sin sesión /api/auth/me responde 401 y aquí no hay datos que mostrar.
export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    void api.get<PublicUser>('/api/auth/me').then((res) => {
      if (res.ok && res.data) setUser(res.data);
      else router.replace('/login');
    });
  }, [router]);

  async function logout() {
    await api.post('/api/auth/logout');
    router.push('/');
  }

  if (!user) return <main>Cargando…</main>;

  return (
    <main>
      <h1>Mi cuenta</h1>
      <dl>
        <dt>Correo</dt>
        <dd>{user.email}</dd>
        <dt>Rol</dt>
        <dd>
          {user.role.name} (nivel {user.role.level} de 5)
        </dd>
      </dl>
      {user.role.level >= 3 && (
        <p>
          <a href="/admin">Administración de cuentas</a>
        </p>
      )}
      <button onClick={logout}>Cerrar sesión</button>
    </main>
  );
}
