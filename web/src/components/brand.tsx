import styles from './brand.module.css';

/** Marca de Atalaya: un radar pequeño con un punto ámbar (lo que la torre detecta) y el nombre. */
export function Brand() {
  return (
    <a href="/" aria-label="Atalaya, ir al inicio" className={styles.brand}>
      <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="16" className={styles.ring} strokeWidth="1.5" />
        <circle cx="18" cy="18" r="9" className={styles.ring} strokeOpacity="0.5" />
        <path d="M18 18 L18 2 A16 16 0 0 1 32 10 Z" className={styles.wedge} />
        <circle cx="25" cy="11" r="2.2" className={styles.blip} />
      </svg>
      <span className={styles.word}>ATALAYA</span>
    </a>
  );
}
