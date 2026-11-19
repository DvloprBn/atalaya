'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Radar } from '@/components/radar';
import { api, type PublicUser } from '@/lib/browser-api';
import styles from './cuenta.module.css';

// Página protegida. La protección REAL es la API: sin sesión, /api/auth/me
// responde 401 y aquí no hay datos que mostrar.
export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    void api.get<PublicUser>('/api/auth/me').then((res) => {
      if (res.ok && res.data) setUser(res.data);
      else router.replace('/login');
    });
  }, [router]);

  if (!user) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;

  return (
    <AppShell user={user}>
      <h1>Mi cuenta</h1>
      <div className={styles.grid}>
        <section className="card stack" aria-labelledby="perfil">
          <h2 id="perfil">Perfil</h2>
          <dl className={styles.facts}>
            <dt>Correo</dt>
            <dd>{user.email}</dd>
            <dt>Rol</dt>
            <dd>
              {user.role.name} <span className="muted">(nivel {user.role.level} de 5)</span>
            </dd>
          </dl>
        </section>

        <section className="card stack" aria-labelledby="analisis">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="analisis">Panel de análisis</h2>
            <span className="chip">vista previa · datos de ejemplo</span>
          </div>
          <div className={styles.preview}>
            <Radar size={240} label="Vista previa del radar de anomalías con datos de ejemplo" />
            <p className="muted">
              Aquí verás tus ventas en el radar: cada punto es un día y los que brillan en ámbar se salen de lo
              normal. Hoy puedes subir tus ventas y limpiarlas en «Mis análisis»; los indicadores y el radar real llegan con v0.10.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
