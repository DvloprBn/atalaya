'use client';
import { day, FIELD_LABELS, ISSUE_LABELS, type MappingField, money } from '@/lib/analysis-view';
import type { QualityReport } from '@/lib/browser-api';
import styles from '../analisis.module.css';

const percent = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)} %`);

/** El informe de calidad. Todo número viene del worker; los ejemplos son TEXTO DEL ARCHIVO y se pintan como texto. */
export function ReportView({ analysisId, report }: { analysisId: string; report: QualityReport }) {
  const base = `/api/analyses/${analysisId}/export`;
  return (
    <>
      <section className="card stack" aria-labelledby="resumen">
        <h2 id="resumen">Resumen</h2>
        <dl className={styles.tiles}>
          <div className={styles.tile}><dt>Filas leídas</dt><dd>{report.rowsRead.toLocaleString('es-MX')}</dd></div>
          <div className={styles.tile}><dt>Filas que se quedaron</dt><dd>{report.rowsKept.toLocaleString('es-MX')} <small className="muted">({percent(report.rowsKept, report.rowsRead)})</small></dd></div>
          <div className={styles.tile} data-flag={report.rowsDropped > 0 ? 'warn' : undefined}>
            <dt>Filas descartadas</dt><dd>{report.rowsDropped.toLocaleString('es-MX')}</dd>
          </div>
          <div className={styles.tile}><dt>Desde</dt><dd>{day(report.dateFrom)}</dd></div>
          <div className={styles.tile}><dt>Hasta</dt><dd>{day(report.dateTo)}</dd></div>
          <div className={styles.tile}><dt>Suma de importes</dt><dd>{money(report.totalAmount)}</dd></div>
        </dl>
        <div className="row">
          <a className="button" href={`${base}/clean`}>Descargar datos limpios (CSV)</a>
          <a className="button secondary" href={`${base}/report`}>Descargar informe (CSV)</a>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Los CSV se abren bien en Excel. El texto que pudiera interpretarse como fórmula (por ejemplo, que empiece con =) sale con
          una comilla simple delante, a propósito.
        </p>
      </section>

      <section className="card stack" aria-labelledby="problemas">
        <h2 id="problemas">Qué se encontró</h2>
        {report.issues.length === 0 ? (
          <p role="status">No se encontró ningún problema: el archivo venía limpio.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Problema</th>
                  <th scope="col">Filas</th>
                  <th scope="col">Qué pasó</th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((issue) => (
                  <tr key={issue.code}>
                    <td>
                      {ISSUE_LABELS[issue.code] ?? 'Otro problema'}
                      {issue.examples.length > 0 && (
                        <ul className={styles.examples} aria-label="Ejemplos">
                          {issue.examples.map((e) => (
                            <li key={e.row}>fila {e.row}: <code>{e.value === '' ? '(vacío)' : e.value}</code></li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="mono">{issue.count.toLocaleString('es-MX')}</td>
                    <td>
                      <span className="chip" data-state={issue.dropped ? 'down' : undefined}>
                        {issue.dropped ? 'se descartaron' : 'se conservaron'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack" aria-labelledby="columnas">
        <h2 id="columnas">Columnas usadas</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Dato</th>
                <th scope="col">Con valor</th>
                <th scope="col">Que no se pudieron leer</th>
              </tr>
            </thead>
            <tbody>
              {report.columns.map((c) => (
                <tr key={c.field}>
                  <td>{FIELD_LABELS[c.field as MappingField] ?? c.field}</td>
                  <td className="mono">{c.filled.toLocaleString('es-MX')} <span className="muted">({percent(c.filled, report.rowsRead)})</span></td>
                  <td className="mono">{c.invalid.toLocaleString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
