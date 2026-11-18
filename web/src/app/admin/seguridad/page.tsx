'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import type { components } from '@/lib/api-schema';
import { api, type PublicUser } from '@/lib/browser-api';
import { AuditTable } from './audit-table';
import { DaySummary } from './day-summary';
import { EventsTable } from './events-table';

const ADMIN_LEVEL = 3;

// Panel de seguridad. Igual que /admin: la pantalla solo pregunta y muestra; qué cuentas se ven
// y qué se oculta lo decide la API. El nivel que se comprueba aquí es solo para no mostrar una pantalla vacía.
export default function SecurityPage() {
  const router = useRouter();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [summary, setSummary] = useState<components['schemas']['SecuritySummary'] | null>(null);

  useEffect(() => {
    void (async () => {
      const who = await api.get<PublicUser>('/api/auth/me');
      if (!who.ok || !who.data) return router.replace('/login');
      if (who.data.role.level < ADMIN_LEVEL) return router.replace('/cuenta');
      setMe(who.data);
      const res = await api.get<components['schemas']['SecuritySummary']>('/api/admin/security/summary');
      if (res.ok && res.data) setSummary(res.data);
    })();
  }, []);

  if (!me) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;

  return (
    <AppShell user={me}>
      <div className="stack" style={{ gap: 8 }}>
        <h1>Seguridad del sistema</h1>
        <p className="muted">
          Lo que el sistema vio y lo que hicieron las personas con acceso. Las cuentas de tu nivel o superior aparecen como «—».
        </p>
      </div>
      {summary && <DaySummary summary={summary} />}
      <EventsTable />
      <AuditTable />
    </AppShell>
  );
}
