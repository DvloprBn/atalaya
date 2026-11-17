import type { ReactNode } from 'react';
import styles from './auth-shell.module.css';
import { Brand } from './brand';
import { Radar } from './radar';

/**
 * Marco de las pantallas públicas (inicio, entrar, registro, enlaces de correo):
 * a la izquierda el contenido de cada pantalla; a la derecha el radar.
 * En un teléfono el radar se oculta y queda solo el contenido.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Brand />
        {children}
        <p className={`mono ${styles.footer}`}>Proyecto de estudio · usa solo datos de prueba</p>
      </main>
      <aside className={styles.scope} aria-label="Cómo trabaja Atalaya">
        <Radar label="Radar de anomalías de ejemplo: nueve días normales y tres fuera de lo normal" />
        <ul className={styles.facts}>
          <li><span className={styles.dotSignal} aria-hidden="true" /> Días normales</li>
          <li><span className={styles.dotAnomaly} aria-hidden="true" /> Días que se salen de lo normal</li>
        </ul>
        <p className="muted">Sube las ventas de tu negocio y Atalaya vigila por ti: tendencias, anomalías y lo que viene.</p>
      </aside>
    </div>
  );
}
