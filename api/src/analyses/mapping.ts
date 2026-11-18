// La regla del mapeo, en un solo lugar y sin dependencias (fácil de probar): el DTO valida la FORMA; esto valida
// que tenga SENTIDO contra la vista previa de ESE archivo. Lo que no sea una columna real o repita una columna se rechaza.

const FIELDS = ['date', 'amount', 'quantity', 'product', 'branch', 'orderId'] as const;
type Field = (typeof FIELDS)[number];

export interface MappingInput extends Partial<Record<Field, number>> {
  date: number;
  amount: number;
  dateOrder?: 'auto' | 'dmy' | 'mdy' | 'ymd';
  decimalSeparator?: 'auto' | '.' | ',';
}

/** Devuelve el mensaje del primer problema, o null si el mapeo es válido para un archivo de `columnCount` columnas. */
export function mappingProblem(mapping: MappingInput, columnCount: number): string | null {
  const used = new Map<number, Field>();
  for (const field of FIELDS) {
    const index = mapping[field];
    if (index === undefined) continue;
    if (index >= columnCount) return `La columna elegida para «${field}» no existe en el archivo (tiene ${columnCount})`;
    const other = used.get(index);
    if (other) return `«${other}» y «${field}» no pueden ser la misma columna`;
    used.set(index, field);
  }
  return null;
}

/** El mapeo tal como se guarda: solo los campos elegidos, con los valores por omisión del contrato ya puestos. */
export function normalizeMapping(mapping: MappingInput): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const field of FIELDS) if (mapping[field] !== undefined) out[field] = mapping[field] as number;
  out.dateOrder = mapping.dateOrder ?? 'auto';
  out.decimalSeparator = mapping.decimalSeparator ?? 'auto';
  return out;
}
