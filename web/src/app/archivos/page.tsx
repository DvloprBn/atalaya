'use client';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { api, type UploadPage } from '@/lib/browser-api';
import { isPending } from '@/lib/upload-view';
import { Pager } from '../admin/seguridad/pager';
import { UploadForm } from './upload-form';
import { UploadsTable } from './uploads-table';
import { SessionProblem, useMe } from '@/lib/use-me';

// Sondeo con retroceso: 2 s, 3 s, 4.5 s… hasta 8 s. Un sondeo fijo y rápido gastaría el tope de peticiones por IP (60/min por ruta).
const pollDelay = (tries: number) => Math.min(2000 * 1.5 ** tries, 8000);

// Mis archivos. La protección REAL es la API (cada archivo es de su dueño; el ajeno responde 404).
export default function FilesPage() {
  const { user, failed, retry } = useMe();
  const [data, setData] = useState<UploadPage | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const res = await api.get<UploadPage>(`/api/uploads?page=${page}`);
    if (res.ok && res.data) setData(res.data);
  }, [page]);


  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // Mientras el worker no termine con algún archivo, la lista se vuelve a leer sola; cuando todo se resuelve, para.
  const waiting = data?.items.some(isPending) ?? false;
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!waiting) return setTries(0);
    const timer = setTimeout(() => {
      void load();
      setTries((n) => n + 1);
    }, pollDelay(tries));
    return () => clearTimeout(timer);
  }, [waiting, tries, load]);

  if (failed) return <SessionProblem onRetry={retry} />;
  if (!user) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;

  return (
    <AppShell user={user}>
      <h1>Mis archivos</h1>
      <div className="stack">
        <UploadForm onUploaded={() => (setPage(1), void load())} />
        <section className="card stack" aria-labelledby="lista">
          <h2 id="lista">Subidos</h2>
          {data && <UploadsTable items={data.items} onChanged={() => void load()} />}
          {data && data.total > data.pageSize && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </section>
      </div>
    </AppShell>
  );
}
