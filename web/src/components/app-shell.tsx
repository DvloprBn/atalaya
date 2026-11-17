'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api, type PublicUser } from '@/lib/browser-api';
import styles from './app-shell.module.css';
import { Brand } from './brand';

const ADMIN_LEVEL = 3;

/**
 * Marco de las pantallas con sesión: barra superior con la marca, la navegación
 * que corresponde a tu nivel, tu correo y el botón de salir.
 * Ojo: ocultar un enlace NO protege nada; quien protege es la API (cerrado por
 * defecto y @MinLevel). Aquí solo se evita mostrar lo que no podrías usar.
 */
export function AppShell({ user, children }: { user: PublicUser; children: ReactNode }) {
  const router = useRouter();

  async function logout() {
    await api.post('/api/auth/logout');
    router.push('/');
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <Brand />
        <nav aria-label="Principal" className={styles.nav}>
          <a href="/cuenta">Mi cuenta</a>
          <a href="/cuenta/seguridad">Seguridad</a>
          {user.role.level >= ADMIN_LEVEL && <a href="/admin">Administración de cuentas</a>}
        </nav>
        <div className={styles.who}>
          <span className="mono muted">
            {user.email} · {user.role.name}
          </span>
          <button className="secondary" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
