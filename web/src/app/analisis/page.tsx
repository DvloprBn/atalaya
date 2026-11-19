'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { ANALYSIS_STATUS, isWorking, KIND_LABELS } from '@/lib/analysis-view';
import { type Analysis, type AnalysisPage, api, type UploadPage } from '@/lib/browser-api';
import { when } from '@/lib/upload-view';
import { Pager } from '../admin/seguridad/pager';
import { SessionProblem, useMe } from '@/lib/use-me';

// Sondeo con retroceso (igual que «Mis archivos»): un sondeo fijo y rápido gastaría el tope de peticiones por IP.
const pollDelay = (tries: number) => Math.min(2000 * 1.5 ** tries, 8000);

// Mis análisis. La protección REAL es la API (cada análisis es de su dueño; el ajeno responde 404).
export default function AnalysesPage() {
  const router = useRouter();
  const { user, failed, retry } = useMe();
  const [data, setData] = useState<AnalysisPage | null>(null);
  const [accepted, setAccepted] = useState<UploadPage['items']>([]);
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState('');
  const [kind, setKind] = useState<Analysis['kind']>('sales');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);

  const load = useCallback(async () => {
    const [a, u] = await Promise.all([api.get<AnalysisPage>(`/api/analyses?page=${page}`), api.get<UploadPage>('/api/uploads')]);
    if (a.ok && a.data) setData(a.data);
    if (u.ok && u.data) setAccepted(u.data.items.filter((x) => x.status === 'accepted'));
  }, [page]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const waiting = data?.items.some(isWorking) ?? false;
  useEffect(() => {
    if (!waiting) return setTries(0);
    const timer = setTimeout(() => {
      void load();
      setTries((n) => n + 1);
    }, pollDelay(tries));
    return () => clearTimeout(timer);
  }, [waiting, tries, load]);

  async function start() {
    if (!pick || busy) return;
    setBusy(true);
    setError('');
    const res = await api.post<Analysis>('/api/analyses', { uploadId: pick, kind });
    setBusy(false);
    if (res.ok && res.data) return router.push(`/analisis/${res.data.id}`);
    setError(res.message ?? 'No se pudo empezar el análisis.');
  }

  if (failed) return <SessionProblem onRetry={retry} />;
  if (!user) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;
  const names = new Map(accepted.map((u) => [u.id, u.displayName ?? 'sin nombre']));

  return (
    <AppShell user={user}>
      <h1>Mis análisis</h1>
      <section className="card stack" aria-labelledby="nuevo">
        <h2 id="nuevo">Nuevo análisis</h2>
        <p className="muted">
          Elige un archivo ya aceptado. Primero verás una vista previa para decir qué columna es cada dato; después se limpia y
          recibes un informe de calidad. Hasta 10 análisis por cuenta.
        </p>
        {accepted.length === 0 ? (
          <p className="muted">
            No tienes archivos aceptados. <a href="/archivos">Sube uno en «Mis archivos»</a>.
          </p>
        ) : (
          <div className="row">
            <label>
              Archivo
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Elige uno…</option>
                {accepted.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName ?? 'sin nombre'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Qué contiene
              <select value={kind} onChange={(e) => setKind(e.target.value as Analysis['kind'])}>
                <option value="sales">Ventas (lo que entra)</option>
                <option value="expenses">Gastos (lo que sale)</option>
              </select>
            </label>
            <button onClick={start} disabled={!pick || busy} style={{ alignSelf: 'flex-end' }}>
              {busy ? 'Empezando…' : 'Empezar'}
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </section>

      <section className="card stack" aria-labelledby="lista">
        <h2 id="lista">Tus análisis</h2>
        {data && data.items.length === 0 && <p className="muted">Todavía no has hecho ninguno.</p>}
        {data && data.items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Archivo</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Empezó</th>
                  <th scope="col"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td style={{ overflowWrap: 'anywhere' }}>
                      {names.get(a.uploadId) ?? <span className="muted">archivo no disponible</span>}
                    </td>
                    <td>{KIND_LABELS[a.kind]}</td>
                    <td>
                      <span className="chip" data-state={a.status === 'done' ? 'ok' : a.status === 'failed' ? 'down' : undefined}>
                        {ANALYSIS_STATUS[a.status]}
                      </span>
                    </td>
                    <td className="mono">{when(a.createdAt)}</td>
                    <td>
                      <a className="button secondary" href={`/analisis/${a.id}`}>Abrir</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        )}
      </section>
    </AppShell>
  );
}
