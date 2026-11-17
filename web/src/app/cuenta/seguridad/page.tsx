'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { api, type PublicUser, type TwoFactorStatus } from '@/lib/browser-api';
import { EnableFlow } from './enable-flow';
import { ManagePanel } from './manage-panel';

// Seguridad de la cuenta. La protección REAL es la API (todas estas rutas piden sesión y
// vuelven a pedir la contraseña); aquí solo se muestra lo que ella responde.
export default function SecurityPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<TwoFactorStatus>('/api/auth/2fa');
    if (res.ok && res.data) setStatus(res.data);
  }, []);

  useEffect(() => {
    void api.get<PublicUser>('/api/auth/me').then(async (res) => {
      if (!res.ok || !res.data) return router.replace('/login');
      setUser(res.data);
      await load();
    });
  }, [router, load]);

  if (!user || !status) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;

  return (
    <AppShell user={user}>
      <h1>Seguridad</h1>
      {status.enabled ? <ManagePanel status={status} onChanged={load} /> : <EnableFlow onDone={load} />}
    </AppShell>
  );
}
