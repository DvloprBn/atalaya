'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { ColumnChart } from '@/components/column-chart';
import { monthLabel, money } from '@/lib/analysis-view';
import type { components } from '@/lib/api-schema';
import { type AnalysisPage, api, type PublicUser, type UploadPage } from '@/lib/browser-api';
import styles from '../analisis/analisis.module.css';

type Profit = components['schemas']['Profit'];
type Choice = { id: string; name: string };

// Ventas menos gastos. La resta la hace la API con centavos enteros (nunca con números de punto flotante): esta pantalla
// solo muestra los textos exactos que ella devuelve. La protección REAL es la API: un análisis ajeno responde 404.
export default function ProfitPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [sales, setSales] = useState<Choice[]>([]);
  const [expenses, setExpenses] = useState<Choice[]>([]);
  const [pickSales, setPickSales] = useState('');
  const [pickExpenses, setPickExpenses] = useState('');
  const [profit, setProfit] = useState<Profit | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const me = await api.get<PublicUser>('/api/auth/me');
      if (!me.ok || !me.data) return router.replace('/login');
      setUser(me.data);
      const [analyses, uploads] = await Promise.all([api.get<AnalysisPage>('/api/analyses'), api.get<UploadPage>('/api/uploads')]);
      const names = new Map((uploads.data?.items ?? []).map((u) => [u.id, u.displayName ?? 'sin nombre']));
      // Solo los terminados y con indicadores (los de antes de v0.10 no los tienen: la API los rechazaría con 409).
      const ready = (analyses.data?.items ?? []).filter((a) => a.status === 'done' && a.insights);
      const choice = (a: (typeof ready)[number]) => ({ id: a.id, name: names.get(a.uploadId) ?? 'archivo no disponible' });
      setSales(ready.filter((a) => a.kind === 'sales').map(choice));
      setExpenses(ready.filter((a) => a.kind === 'expenses').map(choice));
    })();
  }, [router]);

  async function show() {
    if (!pickSales || !pickExpenses || busy) return;
    setBusy(true);
    setError('');
    const res = await api.get<Profit>(`/api/profit?sales=${pickSales}&expenses=${pickExpenses}`);
    setBusy(false);
    if (res.ok && res.data) return setProfit(res.data);
    setProfit(null);
    setError(res.message ?? 'No se pudo calcular el resultado.');
  }

  if (!user) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;
  const missing = sales.length === 0 || expenses.length === 0;
  const loss = (text: string) => text.startsWith('-');

  return (
    <AppShell user={user}>
      <h1>Resultado</h1>
      <section className="card stack" aria-labelledby="elegir">
        <h2 id="elegir">Ventas menos gastos</h2>
        <p className="muted">Elige un análisis de ventas y uno de gastos, ya terminados, y verás qué quedó cada mes.</p>
        {missing ? (
          <p className="muted">
            Necesitas al menos un análisis de ventas y uno de gastos terminados.{' '}
            <a href="/analisis">Empieza uno en «Mis análisis»</a>
            {sales.length === 0 ? ' (te falta uno de ventas)' : ''}
            {expenses.length === 0 ? ' (te falta uno de gastos)' : ''}.
          </p>
        ) : (
          <div className="row">
            <label>
              Ventas
              <select value={pickSales} onChange={(e) => setPickSales(e.target.value)}>
                <option value="">Elige uno…</option>
                {sales.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>
              Gastos
              <select value={pickExpenses} onChange={(e) => setPickExpenses(e.target.value)}>
                <option value="">Elige uno…</option>
                {expenses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button onClick={show} disabled={!pickSales || !pickExpenses || busy} style={{ alignSelf: 'flex-end' }}>
              {busy ? 'Calculando…' : 'Ver resultado'}
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </section>

      {profit && (
        <>
          <section className="card stack" aria-labelledby="totales">
            <h2 id="totales">Totales</h2>
            <dl className={styles.tiles}>
              <div className={styles.tile}><dt>Ventas</dt><dd>{money(profit.salesTotal)}</dd></div>
              <div className={styles.tile}><dt>Gastos</dt><dd>{money(profit.expensesTotal)}</dd></div>
              <div className={styles.tile} data-flag={loss(profit.resultTotal) ? 'warn' : undefined}>
                <dt>{loss(profit.resultTotal) ? 'Pérdida' : 'Ganancia'}</dt>
                <dd>{money(profit.resultTotal)}</dd>
              </div>
            </dl>
          </section>

          <section className="card stack" aria-labelledby="meses">
            <h2 id="meses">Mes a mes</h2>
            <ColumnChart
              startAtEnd
              label={`Resultado por mes (ventas menos gastos), de ${monthLabel(profit.months[0].month)} a ${monthLabel(profit.months.at(-1)!.month)}`}
              items={profit.months.map((m) => ({ label: monthLabel(m.month), value: m.result, alert: loss(m.result) }))}
              alertText="mes con pérdida"
            />
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th scope="col">Mes</th><th scope="col">Ventas</th><th scope="col">Gastos</th><th scope="col">Resultado</th></tr>
                </thead>
                <tbody>
                  {profit.months.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="mono">{money(m.sales)}</td>
                      <td className="mono">{money(m.expenses)}</td>
                      <td className="mono">
                        {money(m.result)} {loss(m.result) && <span className="chip" data-state="down">pérdida</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Un mes que solo aparece en uno de los dos análisis cuenta 0.00 en el otro. La resta se hace con centavos exactos.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
