'use client';
import styles from './seguridad.module.css';

/**
 * Los 10 códigos de recuperación. SOLO se ven aquí, una vez: la base guarda su hash y no hay
 * forma de volver a mostrarlos. Por eso se ofrece copiar y descargar antes de seguir.
 */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');

  function download() {
    const url = URL.createObjectURL(new Blob([`Atalaya · códigos de recuperación\n\n${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atalaya-codigos-de-recuperacion.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={`card stack ${styles.warn}`} aria-labelledby="codigos">
      <h2 id="codigos">Guarda tus códigos de recuperación</h2>
      <p className="muted">
        Si pierdes tu teléfono, cada código te deja entrar <strong>una vez</strong>. Se muestran solo ahora: guárdalos en
        un lugar seguro, aparte de tu contraseña.
      </p>
      <ol className={styles.codes} aria-label="Códigos de recuperación">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="secondary" onClick={() => void navigator.clipboard?.writeText(text)}>
          Copiar
        </button>
        <button type="button" className="secondary" onClick={download}>
          Descargar .txt
        </button>
        <button type="button" onClick={onDone}>
          Ya los guardé
        </button>
      </div>
    </section>
  );
}
