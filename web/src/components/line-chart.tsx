'use client';
import { useState } from 'react';
import { dayShort, money } from '@/lib/analysis-view';
import { compact, niceTicks } from './chart-scale';
import styles from './charts.module.css';

export interface ForecastPoint {
  date: string;
  expected: string;
  lower: string;
  upper: string;
}

const W = 720;
const H = 240;
const M = { l: 62, r: 16, t: 22, b: 30 };

/**
 * El pronóstico: una línea (lo esperado) con su banda (el intervalo), sobre un solo eje que arranca en cero. Línea de 2 px,
 * banda de un tinte del mismo color (nunca un bloque saturado), y un punto de 8 px al final con un anillo del color de la
 * superficie. El valor exacto de cada día va en el tooltip (con una guía vertical) y en la tabla que acompaña la gráfica.
 */
export function ForecastChart({ label, points }: { label: string; points: ForecastPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const expected = points.map((p) => Number(p.expected));
  const lower = points.map((p) => Number(p.lower));
  const upper = points.map((p) => Number(p.upper));
  const ticks = niceTicks(Math.min(0, ...lower), Math.max(0, ...upper));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const x = (i: number) => M.l + (i / (points.length - 1)) * plotW;
  const y = (v: number) => M.t + plotH - ((v - lo) / (hi - lo)) * plotH;
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join('');
  const band = `${path(upper)}${[...lower].reverse().map((v, i) => `L${x(points.length - 1 - i)} ${y(v)}`).join('')}Z`;
  const last = points.length - 1;
  const step = plotW / last;

  return (
    <div className={styles.frame}>
      <div className={styles.canvas} style={{ minWidth: 480 }}>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? styles.zero : styles.grid} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
            <text className={styles.tick} x={M.l - 8} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
          </g>
        ))}
        <path className={styles.band} d={band} />
        <path className={styles.line} d={path(expected)} />
        {[0, Math.floor(last / 2), last].map((i) => (
          <text key={i} className={styles.tick} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>{dayShort(points[i].date)}</text>
        ))}
        <circle className={styles.dot} cx={x(last)} cy={y(expected[last])} r={4} />
        {hover !== null && (
          <>
            <line className={styles.cross} x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + plotH} />
            <circle className={styles.dot} cx={x(hover)} cy={y(expected[hover])} r={4} />
          </>
        )}
        {points.map((p, i) => (
          <rect key={p.date} className={styles.hit} x={x(i) - step / 2} y={M.t} width={step} height={plotH} onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className={styles.tooltip} style={{ left: `${(x(hover) / W) * 100}%` }}>
          {dayShort(points[hover].date)}: <strong>{money(points[hover].expected)}</strong>
          <br />
          entre {money(points[hover].lower)} y {money(points[hover].upper)}
        </div>
      )}
      </div>
      <p className={styles.legend}>
        <span className={styles.key}><span className={styles.swatch} /> lo esperado, con su intervalo (≈ 80 %)</span>
      </p>
    </div>
  );
}
