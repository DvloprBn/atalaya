'use client';
import { useEffect, useRef, useState } from 'react';
import { money } from '@/lib/analysis-view';
import { barPath, compact, niceTicks } from './chart-scale';
import styles from './charts.module.css';

export interface ColumnItem {
  label: string;
  /** El importe como TEXTO exacto (contrato). Solo se convierte a número para calcular la altura de la barra. */
  value: string;
  alert?: boolean;
  /** Algo que decir de ESA barra en el tooltip (p. ej. «mes incompleto»). */
  note?: string;
}

const W = 720;
const H = 240;
const M = { l: 62, r: 12, t: 22, b: 30 };

/**
 * Columnas de UNA serie, sobre un solo eje que arranca en cero. Reglas (guía de visualización): barras de máximo 24 px con
 * el extremo de datos redondeado y la base recta, cuadrícula de un pixel y recesiva, el valor escrito solo en la barra
 * extrema (no uno por barra), y el resto, en el tooltip y en la tabla equivalente que SIEMPRE acompaña a la gráfica.
 * El color de cada barra solo cambia (ámbar) para lo que la persona debe mirar; nunca es el único canal: la tabla lo dice.
 */
export function ColumnChart({ label, items, alertText, startAtEnd }: { label: string; items: ColumnItem[]; alertText?: string; startAtEnd?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  // En una serie de tiempo, lo reciente es lo que importa: en un teléfono (donde la gráfica se desplaza) arranca al final.
  useEffect(() => {
    if (startAtEnd && frame.current) frame.current.scrollLeft = frame.current.scrollWidth;
  }, [startAtEnd, items.length]);
  if (items.length === 0) return null;

  const numbers = items.map((i) => Number(i.value));
  const ticks = niceTicks(Math.min(0, ...numbers), Math.max(0, ...numbers));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const y = (v: number) => M.t + plotH - ((v - lo) / (hi - lo)) * plotH;
  const band = plotW / items.length;
  const barW = Math.min(24, band * 0.62);
  const labelEvery = Math.ceil(items.length / 8);
  const extreme = numbers.reduce((best, v, i) => (Math.abs(v) > Math.abs(numbers[best]) ? i : best), 0);
  const centerX = (i: number) => M.l + i * band + band / 2;
  const extremeX = centerX(extreme);

  return (
    <div className={styles.frame} ref={frame}>
      <div className={styles.canvas} style={{ minWidth: Math.max(300, items.length * 24 + 90) }}>
      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? styles.zero : styles.grid} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
            <text className={styles.tick} x={M.l - 8} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
          </g>
        ))}
        {items.map((item, i) => (
          <path key={item.label} className={styles.bar} data-alert={item.alert ? 'true' : undefined} d={barPath(centerX(i) - barW / 2, barW, y(0), y(numbers[i]))} />
        ))}
        {items.map((item, i) =>
          i % labelEvery === 0 ? (
            <text key={item.label} className={styles.tick} x={centerX(i)} y={H - 8} textAnchor="middle">{item.label}</text>
          ) : null,
        )}
        {/* El valor solo en la barra extrema, escrito con el texto exacto: «etiquetar con cuidado», nunca un número por barra. */}
        <text
          className={styles.value}
          x={extremeX}
          y={numbers[extreme] >= 0 ? y(numbers[extreme]) - 6 : y(numbers[extreme]) + 16}
          textAnchor={extremeX > W - 90 ? 'end' : extremeX < M.l + 50 ? 'start' : 'middle'}
        >
          {money(items[extreme].value)}
        </text>
        {items.map((item, i) => (
          <rect key={item.label} className={styles.hit} x={M.l + i * band} y={M.t} width={band} height={plotH} onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className={styles.tooltip} style={{ left: `${(centerX(hover) / W) * 100}%` }}>
          {items[hover].label}: <strong>{money(items[hover].value)}</strong>
          {items[hover].note ? ` · ${items[hover].note}` : items[hover].alert && alertText ? ` · ${alertText}` : ''}
        </div>
      )}
      </div>
      {alertText && items.some((i) => i.alert) && (
        <p className={styles.legend}>
          <span className={styles.key}><span className={styles.swatch} /> normal</span>
          <span className={styles.key}><span className={styles.swatch} data-alert="true" /> {alertText}</span>
        </p>
      )}
    </div>
  );
}
