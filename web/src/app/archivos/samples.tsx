/**
 * v1.0 · Datos de ejemplo para probar sin tener un negocio a la mano: un café ficticio (3 sucursales, 2 años) con
 * anomalías sembradas, sus gastos, CFDI sintéticos y un reporte en PDF. Ninguno es de una persona ni de un negocio real.
 * Los genera scripts/preparar-ejemplos.sh (deterministas) y Next los sirve desde public/ejemplos.
 */
const SAMPLES = [
  { file: 'cafe-ventas.csv', what: 'Ventas del café, limpias (≈ 24 700 renglones)' },
  { file: 'cafe-ventas-sucio.csv', what: 'Las mismas ventas con errores sembrados, para ver la limpieza' },
  { file: 'cafe-gastos.csv', what: 'Gastos del café (renta, nómina, insumos…)' },
  { file: 'cfdi-cafe.zip', what: 'CFDI sintéticos con el RFC de pruebas del SAT' },
  { file: 'reporte-ventas.pdf', what: 'Un reporte de ventas en PDF con una tabla' },
];

export function Samples() {
  return (
    <section className="card stack" aria-labelledby="ejemplos">
      <h2 id="ejemplos">Datos de ejemplo</h2>
      <p className="muted">Un café inventado: descárgalos y súbelos aquí mismo. No son de ninguna persona ni negocio real.</p>
      <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
        {SAMPLES.map((s) => (
          <li key={s.file}>
            <a href={`/ejemplos/${s.file}`} download>
              {s.file}
            </a>{' '}
            <span className="muted">— {s.what}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
