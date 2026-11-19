'use client';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { ANALYSIS_STATUS, FAIL_LABELS, isWorking, KIND_LABELS } from '@/lib/analysis-view';
import { type Analysis, api, type PublicUser } from '@/lib/browser-api';
import { InsightsView } from './insights-view';
import { MappingForm } from './mapping-form';
import { ReportView } from './report-view';

const pollDelay = (tries: number) => Math.min(2000 * 1.5 ** tries, 8000); // retroceso: ver «Mis archivos»

// Un análisis. La protección REAL es la API: el análisis de otra cuenta responde 404 y aquí no hay nada que mostrar.
export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [missing, setMissing] = useState(false);
  const [tries, setTries] = useState(0);

  const load = useCallback(async () => {
    const res = await api.get<Analysis>(`/api/analyses/${id}`);
    if (res.ok && res.data) setAnalysis(res.data);
    else if (res.status === 404) setMissing(true);
  }, [id]);

  useEffect(() => {
    void api.get<PublicUser>('/api/auth/me').then((res) => {
      if (res.ok && res.data) setUser(res.data);
      else router.replace('/login');
    });
  }, [router]);
  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const working = analysis ? isWorking(analysis) : false;
  useEffect(() => {
    if (!working) return setTries(0);
    const timer = setTimeout(() => {
      void load();
      setTries((n) => n + 1);
    }, pollDelay(tries));
    return () => clearTimeout(timer);
  }, [working, tries, load]);

  async function remove() {
    if (!window.confirm('¿Borrar este análisis y sus resultados? El archivo que subiste no se toca.')) return;
    await api.delete(`/api/analyses/${id}`);
    router.push('/analisis');
  }

  if (!user) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;
  return (
    <AppShell user={user}>
      <p><a href="/analisis">← Mis análisis</a></p>
      <h1>{analysis ? `Análisis de ${KIND_LABELS[analysis.kind]}` : 'Análisis'}</h1>
      {missing && <p role="alert">Este análisis no existe.</p>}
      {analysis && (
        <>
          <div className="row">
            <span className="chip" data-state={analysis.status === 'done' ? 'ok' : analysis.status === 'failed' ? 'down' : undefined}>
              {ANALYSIS_STATUS[analysis.status]}
            </span>
            <button className="secondary" onClick={remove}>Borrar análisis</button>
          </div>

          {working && (
            <p role="status" className="muted">
              {analysis.status === 'previewing' ? 'Leyendo el archivo…' : 'Limpiando los datos…'} esta página se actualiza sola.
            </p>
          )}
          {analysis.status === 'failed' && (
            <section className="card stack">
              <h2>No se pudo completar</h2>
              <p role="alert">{FAIL_LABELS[analysis.failReason ?? ''] ?? 'El análisis no pudo completarse.'}</p>
              <p className="muted">Puedes borrarlo y empezar otro desde «Mis análisis».</p>
            </section>
          )}
          {analysis.status === 'awaiting_mapping' && analysis.preview && (
            <MappingForm analysisId={analysis.id} kind={analysis.kind} preview={analysis.preview} onSaved={setAnalysis} />
          )}
          {analysis.status === 'done' && analysis.report && <ReportView analysisId={analysis.id} report={analysis.report} />}
          {analysis.status === 'done' && analysis.insights && <InsightsView kind={analysis.kind} insights={analysis.insights} period={{ from: analysis.report?.dateFrom ?? null, to: analysis.report?.dateTo ?? null }} />}
          {analysis.status === 'done' && !analysis.insights && (
            <section className="card stack">
              <p className="muted">
                Este análisis es anterior a los indicadores (Pareto, anomalías y pronóstico). Bórralo y vuelve a crearlo desde «Mis análisis» para tenerlos.
              </p>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
