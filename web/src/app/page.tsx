import { AuthShell } from '@/components/auth-shell';
import { getHealth } from '@/lib/api';

// Se arma en el servidor en cada visita: el estado tiene que ser el de ahora.
export const dynamic = 'force-dynamic';

const PIECES: Record<string, string> = { database: 'base de datos', redis: 'redis', worker: 'worker de análisis' };

export default async function HomePage() {
  const health = await getHealth();

  return (
    <AuthShell>
      <div className="stack">
        <h1>El observatorio de los datos de tu negocio</h1>
        <p className="muted">
          Atalaya lee tus ventas, limpia los datos y te avisa cuando algo se sale de lo normal. Es un proyecto de
          estudio: acceso seguro de punta a punta y análisis de datos.
        </p>
      </div>

      <div className="row">
        <a href="/login" className="button">Entrar</a>
        <a href="/registro" className="button secondary">Crear una cuenta</a>
      </div>

      <section className="stack" aria-labelledby="estado">
        <h2 id="estado">Estado del sistema</h2>
        {health ? (
          <ul className="row" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {Object.entries(health.checks).map(([piece, state]) => (
              <li key={piece} className="chip" data-state={state}>
                {PIECES[piece] ?? piece}: {state === 'ok' ? 'en línea' : 'sin respuesta'}
              </li>
            ))}
          </ul>
        ) : (
          <p role="alert">La API no responde.</p>
        )}
      </section>
    </AuthShell>
  );
}
