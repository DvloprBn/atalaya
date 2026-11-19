'use client';
import { ColumnChart } from '@/components/column-chart';
import { ForecastChart } from '@/components/line-chart';
import { day, monthLabel, money, partialMonths, percentText, signedPercent, WEEKDAYS } from '@/lib/analysis-view';
import type { Analysis } from '@/lib/browser-api';
import styles from '../analisis.module.css';
import { ParetoTable, ShareTable } from './share-tables';

type Insights = NonNullable<Analysis['insights']>;

/** La gráfica NUNCA va sola: la misma información, como tabla, para quien no ve colores ni usa ratón. */
function DataTable({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{summary}</summary>
      <div style={{ overflowX: 'auto' }}>
        <table>{children}</table>
      </div>
    </details>
  );
}

const Tile = ({ label, value, flag }: { label: string; value: string; flag?: boolean }) => (
  <div className={styles.tile} data-flag={flag ? 'warn' : undefined}>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

/** Los indicadores, el Pareto, las anomalías y el pronóstico. Todo texto de producto o sucursal es DATO del archivo: se escapa. */
export function InsightsView({ kind, insights, period }: { kind: Analysis['kind']; insights: Insights; period: { from: string | null; to: string | null } }) {
  const ind = insights.indicators;
  const sales = kind === 'sales';
  const unit = sales ? 'productos' : 'categorías';
  const partial = partialMonths(period.from, period.to);

  return (
    <>
      <section className="card stack" aria-labelledby="indicadores">
        <h2 id="indicadores">{sales ? 'Cómo van tus ventas' : 'Cómo van tus gastos'}</h2>
        <dl className={styles.tiles}>
          <Tile label={sales ? 'Ventas netas' : 'Gasto neto'} value={money(ind.netAmount)} />
          <Tile label={sales ? 'Ventas brutas' : 'Gasto bruto'} value={money(ind.grossAmount)} />
          <Tile label={sales ? 'Devoluciones' : 'Notas de crédito'} value={money(ind.returnsAmount)} flag={ind.returnsAmount !== '0.00'} />
          <Tile label="Días con datos" value={ind.activeDays.toLocaleString('es-MX')} />
          <Tile label="Promedio por día con datos" value={money(ind.averagePerActiveDay)} />
          {ind.orders !== null && <Tile label="Pedidos" value={ind.orders.toLocaleString('es-MX')} />}
          {ind.averageTicket !== null && <Tile label="Ticket promedio" value={money(ind.averageTicket)} />}
          {ind.bestDay && <Tile label={sales ? 'Mejor día' : 'Día de mayor gasto'} value={`${money(ind.bestDay.amount)} · ${day(ind.bestDay.date)}`} />}
          {ind.worstDay && <Tile label={sales ? 'Peor día' : 'Día de menor gasto'} value={`${money(ind.worstDay.amount)} · ${day(ind.worstDay.date)}`} />}
        </dl>
        <p className="muted" style={{ fontSize: 13 }}>
          Todo se calculó con los importes exactos del archivo (sin redondear antes de tiempo). Zona horaria: {insights.timezone}; «hoy» es {day(insights.asOf)}.
        </p>
      </section>

      <section className="card stack" aria-labelledby="mensual">
        <h2 id="mensual">Mes a mes</h2>
        <ColumnChart startAtEnd label={`Importe neto por mes, de ${monthLabel(insights.monthly[0].month)} a ${monthLabel(insights.monthly.at(-1)!.month)}`} items={insights.monthly.map((m) => ({ label: monthLabel(m.month), value: m.amount, note: partial.has(m.month) ? `mes incompleto: ${partial.get(m.month)}` : undefined }))} />
        {partial.size > 0 && (
          <p className="muted" style={{ fontSize: 13 }}>
            {[...partial].map(([m, why]) => `${monthLabel(m)} está incompleto (${why})`).join('; ')}: su barra es baja por falta de días, no necesariamente de {sales ? 'ventas' : 'gasto'}.
          </p>
        )}
        <DataTable summary="Ver los datos de la gráfica">
          <thead><tr><th scope="col">Mes</th><th scope="col">Importe</th><th scope="col">Filas</th><th scope="col">Contra el mes anterior</th></tr></thead>
          <tbody>
            {insights.monthly.map((m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month)}{partial.has(m.month) && <span className="muted"> (incompleto)</span>}</td>
                <td className="mono">{money(m.amount)}</td>
                <td className="mono">{m.rows.toLocaleString('es-MX')}</td>
                <td className="mono">{m.changePercent === null ? '—' : signedPercent(m.changePercent)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section className="card stack" aria-labelledby="semana">
        <h2 id="semana">Qué días de la semana</h2>
        <ColumnChart label="Promedio del total diario por día de la semana" items={insights.weekdays.map((w) => ({ label: WEEKDAYS[w.weekday - 1].slice(0, 3), value: w.average }))} />
        <DataTable summary="Ver los datos de la gráfica">
          <thead><tr><th scope="col">Día</th><th scope="col">Promedio</th><th scope="col">Días con datos</th></tr></thead>
          <tbody>
            {insights.weekdays.map((w) => (
              <tr key={w.weekday}>
                <td>{WEEKDAYS[w.weekday - 1]}</td>
                <td className="mono">{money(w.average)}</td>
                <td className="mono">{w.days}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      {insights.branches && (
        <section className="card stack" aria-labelledby="sucursales">
          <h2 id="sucursales">Por sucursal</h2>
          <ShareTable name="Sucursal" rows={insights.branches} />
        </section>
      )}

      {insights.pareto && (
        <section className="card stack" aria-labelledby="pareto">
          <h2 id="pareto">Pareto: qué {unit} concentran el importe</h2>
          <p className="muted">Pocos elementos suelen traer la mayor parte. La clase A es lo que hay que cuidar primero.</p>
          <ParetoTable pareto={insights.pareto} unit={unit} />
        </section>
      )}

      <section className="card stack" aria-labelledby="anomalias">
        <h2 id="anomalias">Días que se salen de lo normal</h2>
        {insights.anomalies.status === 'insufficient_data' ? (
          <p className="muted">
            No hay suficientes días con datos para decir cuáles se salen de lo normal: hacen falta 28 y que el 60 % de los días del rango los tengan
            {sales ? '' : ' (los gastos suelen ser espaciados: renta, nómina…)'}.
          </p>
        ) : insights.anomalies.items.length === 0 ? (
          <p role="status">Ningún día se salió de lo normal.</p>
        ) : (
          <>
            <p className="muted">Cada día se compara con el mismo día de la semana de las 5 semanas de cada lado, así que la tendencia y la temporada no lo confunden.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.wideTable}>
                <thead><tr><th scope="col">Fecha</th><th scope="col">Real</th><th scope="col">Lo normal</th><th scope="col">Qué pasó</th><th scope="col">Puntaje</th></tr></thead>
                <tbody>
                  {insights.anomalies.items.map((a) => (
                    <tr key={a.date}>
                      <td>{day(a.date)}</td>
                      <td className="mono">{money(a.amount)}</td>
                      <td className="mono">{money(a.expected)}</td>
                      <td><span className="chip" data-state="down">{a.direction === 'high' ? 'más alto' : 'más bajo'}</span></td>
                      <td className="mono">{a.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby="pronostico">
        <h2 id="pronostico">Pronóstico de los próximos 14 días</h2>
        {insights.forecast.status === 'insufficient_data' ? (
          <p className="muted">
            No hay historia suficiente para pronosticar: hacen falta 8 semanas y que el 60 % de los días del rango tengan datos
            {sales ? '' : ' (los gastos son espaciados: un promedio por día de la semana no diría nada)'}.
          </p>
        ) : (
          <>
            <p className="muted">
              Es el promedio de las últimas 8 veces que cayó ese día de la semana: <strong>un punto de partida, no un modelo</strong>. No ve tendencia, feriados ni promociones.
            </p>
            <ForecastChart label="Importe esperado por día, con su intervalo" points={insights.forecast.points} />
            <p role="status">
              {insights.forecast.backtest === null
                ? 'No hay historia suficiente para medir cuánto se habría equivocado este método.'
                : insights.forecast.backtest.wape === null
                  ? 'No se pudo medir el error de este método (lo real de los últimos 14 días suma 0).'
                  : `Si este método se hubiera usado en los últimos 14 días, sin ver esos días, se habría equivocado en promedio ${percentText(insights.forecast.backtest.wape)} (error ponderado).`}
            </p>
            <DataTable summary="Ver los datos de la gráfica">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Esperado</th><th scope="col">Entre</th></tr></thead>
              <tbody>
                {insights.forecast.points.map((p) => (
                  <tr key={p.date}>
                    <td>{day(p.date)}</td>
                    <td className="mono">{money(p.expected)}</td>
                    <td className="mono">{money(p.lower)} – {money(p.upper)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        )}
      </section>
    </>
  );
}
