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
  unsupported_document: 'Comprobantes que no son ventas ni gastos (pagos, traslados, nóminas)',
  unsupported_currency: 'Comprobantes en otra moneda (solo se leen los de MXN)',
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
export function duplicateColumn(mapping: Partial<Record<MappingField, number>>, kind: Analysis['kind'] = 'sales'): string | null {
  const used = new Map<number, MappingField>();
  for (const { key } of FIELDS) {
    const index = mapping[key];
    if (index === undefined) continue;
    const other = used.get(index);
    if (other) return `«${fieldLabel(kind, other)}» y «${fieldLabel(kind, key)}» no pueden ser la misma columna.`;
    used.set(index, key);
  }
  return null;
}

export type { AnalysisMapping };

/**
 * Importe `-1234567.50` → `-$1,234,567.50`, trabajando con el TEXTO. Pasarlo por `Number` perdería dígitos con cifras
 * grandes (un total de 50 000 filas puede pasar de 2^53), y el dinero del contrato es texto decimal exacto a propósito.
 */
export function money(text: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(text);
  if (!match) return text; // lo que no es un importe se muestra tal cual: nunca se «arregla»
  return `${match[1]}$${match[2].replace(/\B(?=(\d{3})+$)/g, ',')}${match[3] ?? ''}`;
}

// Las fechas se interpretan en UTC a propósito: «2026-03-01» no debe caer en febrero por la zona horaria del navegador.
export const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }) : '—';
export const dayShort = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export const KIND_LABELS: Record<Analysis['kind'], string> = { sales: 'ventas', expenses: 'gastos' };

/** «producto» en ventas es «categoría» en gastos: el campo del contrato es el mismo (`product`); cambia el nombre. */
export const fieldLabel = (kind: Analysis['kind'], key: MappingField) =>
  key === 'product' && kind === 'expenses' ? 'Categoría del gasto' : FIELD_LABELS[key];

export const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']; // ISO: 1 = lunes

export const percentText = (text: string) => `${text} %`;
export const signedPercent = (text: string) => `${text.startsWith('-') ? '' : '+'}${text} %`;

export const CLASS_LABELS: Record<string, string> = { A: 'A · concentra el 80 %', B: 'B · hasta el 95 %', C: 'C · el resto' };

/**
 * Los meses de los extremos que el archivo NO cubre completos (empieza el 18 o termina el 17): su barra es baja por falta de
 * días, no por falta de ventas, y sin decirlo la gráfica engaña. Devuelve `AAAA-MM` → qué falta.
 */
export function partialMonths(from: string | null, to: string | null): Map<string, string> {
  const partial = new Map<string, string>();
  if (from && Number(from.slice(8, 10)) > 1) partial.set(from.slice(0, 7), `empieza el ${dayShort(from)}`);
  if (to) {
    const [y, m, d] = to.split('-').map(Number);
    if (d < new Date(Date.UTC(y, m, 0)).getUTCDate()) partial.set(to.slice(0, 7), `termina el ${dayShort(to)}`);
  }
  return partial;
}
