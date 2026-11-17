import { getHealth } from '@/lib/api';

// Se arma en el servidor en cada visita: el estado tiene que ser el de ahora.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await getHealth();

  return (
    <main>
      <h1>Atalaya</h1>
      <p>Proyecto de estudio: acceso seguro y análisis de datos de un negocio.</p>

      <h2>Estado del sistema</h2>
      {health ? (
        <table>
          <tbody>
            <tr>
              <th scope="row">General</th>
              <td>{health.status}</td>
            </tr>
            {Object.entries(health.checks).map(([piece, state]) => (
              <tr key={piece}>
                <th scope="row">{piece}</th>
                <td>{state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p role="alert">La API no responde.</p>
      )}
    </main>
  );
}
