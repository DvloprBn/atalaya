'use client';
import { type FormEvent, useState } from 'react';
import { duplicateColumn, FIELDS, fieldLabel, type MappingField } from '@/lib/analysis-view';
import { type Analysis, type AnalysisMapping, api } from '@/lib/browser-api';
import styles from '../analisis.module.css';

type Preview = NonNullable<Analysis['preview']>;
type Order = NonNullable<AnalysisMapping['dateOrder']>;
type Separator = NonNullable<AnalysisMapping['decimalSeparator']>;

/**
 * Paso 2: la persona dice qué columna es cada dato. El formulario completo desde el inicio (fecha e importe
 * obligatorios, el resto opcional, y las dos opciones de formato), con la sugerencia del worker ya elegida.
 * Los nombres y ejemplos son TEXTO DEL ARCHIVO: React los escapa, nunca se pintan como HTML.
 */
export function MappingForm({ analysisId, kind, preview, onSaved }: { analysisId: string; kind: Analysis['kind']; preview: Preview; onSaved: (a: Analysis) => void }) {
  const [choice, setChoice] = useState<Record<MappingField, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(preview.suggested[f.key] ?? '')])) as Record<MappingField, string>,
  );
  const [dateOrder, setDateOrder] = useState<Order>('auto');
  const [separator, setSeparator] = useState<Separator>('auto');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const mapping: Partial<Record<MappingField, number>> = {};
    for (const { key } of FIELDS) if (choice[key] !== '') mapping[key] = Number(choice[key]);
    // Revisión de cortesía; la API vuelve a validar contra la vista previa de este archivo.
    if (mapping.date === undefined || mapping.amount === undefined) return setError('Elige la columna de la fecha y la del importe.');
    const duplicated = duplicateColumn(mapping, kind);
    if (duplicated) return setError(duplicated);

    setError('');
    setBusy(true);
    const res = await api.put<Analysis>(`/api/analyses/${analysisId}/mapping`, { ...mapping, dateOrder, decimalSeparator: separator });
    setBusy(false);
    if (res.ok && res.data) onSaved(res.data);
    else setError(res.message ?? 'No se pudo guardar el mapeo.');
  }

  const rows = Math.max(0, ...preview.columns.map((c) => c.samples.length));
  return (
    <>
      <form className="card stack" onSubmit={submit} aria-labelledby="mapeo">
        <h2 id="mapeo">¿Qué columna es cada dato?</h2>
        <p className="muted">
          Encontramos {preview.rowCount.toLocaleString('es-MX')} filas y {preview.columns.length} columnas. Ya elegimos lo que nos
          pareció; confírmalo o cámbialo. Fecha e importe son obligatorios.
        </p>
        <fieldset className={styles.fields}>
          <legend>Columnas</legend>
          {FIELDS.map((f) => (
            <label key={f.key}>
              {fieldLabel(kind, f.key)}
              {f.required ? ' (obligatorio)' : ''}
              <select value={choice[f.key]} onChange={(e) => setChoice({ ...choice, [f.key]: e.target.value })} aria-required={f.required}>
                {!f.required && <option value="">— no usar —</option>}
                {f.required && <option value="">Elige una columna…</option>}
                {preview.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.index + 1} · {c.name || '(sin nombre)'}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
        <div className={styles.options}>
          <label>
            Orden de las fechas con diagonales (03/04/2026)
            <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as Order)}>
              <option value="auto">Que lo decida el archivo (y avisar si dudo)</option>
              <option value="dmy">Día / mes / año</option>
              <option value="mdy">Mes / día / año</option>
            </select>
          </label>
          <label>
            Separador decimal de los importes
            <select value={separator} onChange={(e) => setSeparator(e.target.value as Separator)}>
              <option value="auto">Que lo decida el archivo</option>
              <option value=".">Punto (1,234.50)</option>
              <option value=",">Coma (1.234,50)</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Limpiar y analizar'}</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>

      <section className="card stack" aria-labelledby="vista">
        <h2 id="vista">Vista previa del archivo</h2>
        <p className="muted">Los primeros valores de cada columna, tal como vienen (recortados).</p>
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.preview}>
            <thead>
              <tr>
                {preview.columns.map((c) => (
                  <th key={c.index} scope="col" title={c.name}>
                    {c.index + 1} · {c.name || '(sin nombre)'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {preview.columns.map((c) => (
                    <td key={c.index} title={c.samples[r]}>{c.samples[r] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
