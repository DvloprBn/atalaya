'use client';
import { useEffect, useState } from 'react';
import styles from './demo-banner.module.css';

const MINUTE = 60_000;

/**
 * v1.0 · El aviso FIJO de la demo (PLAN_DESARROLLO.md §6): la fecha y hora del borrado y cuánto falta. Vive en el marco
 * de todas las pantallas con sesión, así que nadie trabaja sin verlo. La fecha la da la API (`expiresAt`); el reloj
 * del navegador solo se usa para la resta, así que un reloj mal puesto mueve la cuenta regresiva, nunca el borrado.
 *
 * Accesibilidad: el texto NO es una región «viva». Un lector de pantalla que anunciara cada minuto que pasa
 * interrumpiría todo; el aviso se lee completo al recorrer la página.
 */
export function DemoBanner({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Cada 30 s basta para una cuenta en minutos (y no despierta al navegador cada segundo).
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const end = new Date(expiresAt);
  const left = end.getTime() - now;
  // En la zona y el idioma del navegador: es la hora de quien lo lee.
  const when = end.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });

  return (
    <aside className={styles.banner} aria-label="Aviso de la demo" data-testid="demo-banner">
      <p>
        <strong>Cuenta de prueba.</strong> Esta cuenta y todo lo que subas se borran el <time dateTime={expiresAt}>{when}</time>. Usa
        solo datos de prueba.
      </p>
      <p className={styles.left} data-testid="demo-countdown">
        {left > 0 ? `Quedan ${formatLeft(left)}` : 'Esta cuenta ya venció: se borra en los próximos minutos.'}
      </p>
    </aside>
  );
}

/** 23 h 41 min · 9 min · menos de 1 min. Sin segundos: el aviso no es un cronómetro. */
export function formatLeft(ms: number): string {
  const minutes = Math.floor(ms / MINUTE);
  if (minutes < 1) return 'menos de 1 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
