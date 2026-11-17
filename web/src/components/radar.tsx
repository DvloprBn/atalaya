import styles from './radar.module.css';

export interface RadarPoint {
  /** Posición en el radar, de -1 a 1 en cada eje (0,0 = el centro). */
  x: number;
  y: number;
  anomaly?: boolean;
}

// Puntos de ejemplo para las pantallas de acceso: 9 días normales y 3 fuera de lo normal.
// En la parte B (análisis) los puntos vendrán de los datos reales del negocio.
const SAMPLE: RadarPoint[] = [
  { x: -0.28, y: -0.33 }, { x: 0.22, y: 0.28 }, { x: -0.44, y: 0.17 }, { x: 0.33, y: -0.17 },
  { x: 0.06, y: 0.56 }, { x: -0.17, y: -0.06 }, { x: 0.5, y: 0.1 }, { x: -0.06, y: -0.6 }, { x: 0.12, y: -0.3 },
  { x: 0.61, y: -0.61, anomaly: true }, { x: -0.72, y: 0.61, anomaly: true }, { x: 0.72, y: 0.5, anomaly: true },
];

/**
 * El radar de anomalías: la pieza central del «Observatorio».
 * Turquesa = días normales; ámbar = días fuera de lo normal. El barrido gira
 * despacio y se detiene si la persona pidió menos movimiento (radar.module.css).
 */
export function Radar({ points = SAMPLE, label, size = 360 }: { points?: RadarPoint[]; label: string; size?: number }) {
  const r = 180;
  return (
    <svg className={styles.radar} width={size} height={size} viewBox="0 0 400 400" role="img" aria-label={label}>
      {[180, 120, 60].map((ring) => (
        <circle key={ring} cx="200" cy="200" r={ring} className={styles.ring} />
      ))}
      <line x1="20" y1="200" x2="380" y2="200" className={styles.axis} />
      <line x1="200" y1="20" x2="200" y2="380" className={styles.axis} />
      <g className={styles.sweep}>
        <path d="M200 200 L200 20 A180 180 0 0 1 356 110 Z" className={styles.wedge} />
        <line x1="200" y1="200" x2="356" y2="110" className={styles.beam} />
      </g>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={200 + p.x * r}
          cy={200 + p.y * r}
          r={p.anomaly ? 7 : 4}
          className={p.anomaly ? styles.anomaly : styles.point}
        />
      ))}
    </svg>
  );
}
