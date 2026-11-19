import { Radar } from '@/components/radar';
import type { components } from '@/lib/api-schema';
import { ATTACK_DAY_EVENTS, EVENT_LABELS, isAttackDay, label, radarPoints } from '@/lib/security-view';

type Summary = components['schemas']['SecuritySummary'];

/** Radar de 14 días + la misma información en tabla (el radar solo no lo lee un lector de pantalla). */
export function DaySummary({ summary }: { summary: Summary }) {
  const attacks = summary.days.filter(isAttackDay).length;
  return (
    <section className="card stack" aria-labelledby="dias">
      <h2 id="dias">Últimos 14 días</h2>
      <p className="muted">
        Cada punto es un día; más lejos del centro, más eventos. En ámbar, los días de ataque (≥ {ATTACK_DAY_EVENTS} eventos o una sesión robada).
      </p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Radar points={radarPoints(summary.days)} size={260} label={`Radar de seguridad: ${attacks} día(s) de ataque en 14 días`} />
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Día (UTC)</th>
                <th scope="col">Eventos</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {[...summary.days].reverse().map((d) => (
                <tr key={d.date} data-attack={isAttackDay(d)}>
                  <td className="mono">{d.date}</td>
                  <td>{d.total}{isAttackDay(d) && <strong style={{ color: 'var(--anomaly)' }}> · ataque</strong>}</td>
                  <td className="muted">
                    {Object.entries(d.byType).map(([t, n]) => `${label(EVENT_LABELS, t)}: ${n}`).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
