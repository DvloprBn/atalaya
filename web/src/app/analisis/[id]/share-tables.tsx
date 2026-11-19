'use client';
import { CLASS_LABELS, money, percentText } from '@/lib/analysis-view';
import type { Analysis } from '@/lib/browser-api';
import styles from '../analisis.module.css';

type Insights = NonNullable<Analysis['insights']>;
type Pareto = NonNullable<Insights['pareto']>;
type Branch = NonNullable<Insights['branches']>[number];

/** Una barra fina dentro de la celda: su largo es la parte; el número exacto va al lado, así que el color no es el único canal. */
function Share({ percent }: { percent: string }) {
  const width = Math.max(0, Math.min(100, Number(percent))); // solo geometría; el texto sale del dato
  return (
    <div className={styles.share}>
      <span className={styles.shareBar} style={{ width: `${width}%` }} aria-hidden="true" />
      <span className="mono">{percentText(percent)}</span>
    </div>
  );
}

/** Los nombres son TEXTO DEL ARCHIVO (dato hostil): React los escapa; nunca se pintan como HTML. */
export function ShareTable({ name, rows }: { name: string; rows: Branch[] }) {
  if (rows.length === 0) return <p className="muted">Ninguna tuvo importe neto positivo.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.wideTable}>
        <thead><tr><th scope="col">{name}</th><th scope="col">Importe</th><th scope="col">Parte del total</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ overflowWrap: 'anywhere' }}>{r.name}</td>
              <td className="mono">{money(r.amount)}</td>
              <td><Share percent={r.sharePercent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ParetoTable({ pareto, unit }: { pareto: Pareto; unit: string }) {
  if (pareto.items.length === 0) return <p className="muted">Ningún elemento tuvo importe neto positivo.</p>;
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.wideTable}>
          <thead>
            <tr>
              <th scope="col">Elemento</th><th scope="col">Importe</th><th scope="col">Parte del total</th>
              <th scope="col">Acumulado</th><th scope="col">Clase</th>
            </tr>
          </thead>
          <tbody>
            {pareto.items.map((item) => (
              <tr key={item.name}>
                <td style={{ overflowWrap: 'anywhere' }}>{item.name}</td>
                <td className="mono">{money(item.amount)}</td>
                <td><Share percent={item.sharePercent} /></td>
                <td className="mono">{percentText(item.cumulativePercent)}</td>
                <td><span className="chip" data-state={item.class === 'A' ? 'ok' : undefined}>{CLASS_LABELS[item.class] ?? item.class}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pareto.otherCount > 0 && (
        <p className="muted">Y {pareto.otherCount.toLocaleString('es-MX')} {unit} más, que suman {money(pareto.otherAmount)}.</p>
      )}
      {pareto.nonPositiveCount > 0 && (
        <p className="muted">
          {pareto.nonPositiveCount.toLocaleString('es-MX')} {unit} tuvieron un total neto de cero o negativo (por ejemplo, solo devoluciones): no entran en el Pareto.
        </p>
      )}
    </>
  );
}
