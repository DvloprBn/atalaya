// Lo que las pantallas de análisis saben decir de cada estado, motivo y problema. Todos son listas CERRADAS que
// vienen de la API (contrato); aquí solo se traducen a frases. Uno que esta tabla no conozca se muestra genérico:
// nunca se pinta tal cual un texto que no se reconoce.
import type { Analysis, AnalysisMapping, QualityReport } from './browser-api';

export const ANALYSIS_STATUS: Record<Analysis['status'], string> = {
  previewing: 'leyendo el archivo',
  awaiting_mapping: 'espera tus columnas',
  queued: 'en cola',
  running: 'limpiando',
  done: 'terminado',
  failed: 'falló',
};

export const FAIL_LABELS: Record<string, string> = {
  unreadable: 'No se pudo leer el archivo.',
  no_header: 'No se encontró una fila de encabezados.',
  too_few_columns: 'Necesita al menos dos columnas.',
  mapping_invalid: 'Las columnas elegidas no son válidas para este archivo.',
  nothing_left: 'Tras la limpieza no quedó ninguna fila válida. Revisa las columnas elegidas.',
  worker_timeout: 'El análisis tardó demasiado y se canceló.',
};

type Issue = QualityReport['issues'][number];

/** Cada problema: qué es y qué pasó con las filas (el informe también lo dice con `dropped`). */
export const ISSUE_LABELS: Record<Issue['code'], string> = {
  blank_row: 'Filas vacías',
  duplicate_row: 'Filas repetidas (se conservó la primera)',
  bad_date: 'Fecha que no se pudo leer',
  future_date: 'Fecha en el futuro',
  bad_amount: 'Importe que no se pudo leer',
  negative_amount: 'Importes negativos (devoluciones)',
  zero_amount: 'Importes en cero',
  bad_quantity: 'Cantidad que no se pudo leer',
  ambiguous_dates: 'Fechas ambiguas (se leyeron como día/mes/año)',
  text_trimmed: 'Texto con espacios o caracteres de más (se limpió)',
  text_truncated: 'Texto de más de 200 caracteres (se recortó)',
};

export type MappingField = 'date' | 'amount' | 'quantity' | 'product' | 'branch' | 'orderId';

export const FIELDS: { key: MappingField; label: string; required?: true }[] = [
  { key: 'date', label: 'Fecha de la venta', required: true },
  { key: 'amount', label: 'Importe', required: true },
  { key: 'quantity', label: 'Cantidad' },
  { key: 'product', label: 'Producto' },
  { key: 'branch', label: 'Sucursal' },
  { key: 'orderId', label: 'Pedido o folio' },
];

export const FIELD_LABELS = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<MappingField, string>;

export const isWorking = (a: Pick<Analysis, 'status'>) => ['previewing', 'queued', 'running'].includes(a.status);

/** Revisión de cortesía del mapeo (la API vuelve a validar): ¿hay dos campos en la misma columna? */
export function duplicateColumn(mapping: Partial<Record<MappingField, number>>): string | null {
  const used = new Map<number, MappingField>();
  for (const { key } of FIELDS) {
    const index = mapping[key];
    if (index === undefined) continue;
    const other = used.get(index);
    if (other) return `«${FIELD_LABELS[other]}» y «${FIELD_LABELS[key]}» no pueden ser la misma columna.`;
    used.set(index, key);
  }
  return null;
}

export type { AnalysisMapping };
export const money = (text: string) => Number(text).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—');
