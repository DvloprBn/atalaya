// Lo que la pantalla de archivos sabe decir de cada estado. Los motivos de rechazo son una lista CERRADA que viene de
// la API (contrato); aquí solo se traducen a una frase. La tabla va tipada con la lista del contrato: un motivo nuevo
// sin su frase no compila. El texto genérico de la tabla queda solo para una API más nueva que esta pantalla.
import type { Upload } from './browser-api';

export const MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPT = '.csv,.xlsx,.xml,.zip,.pdf';

export const STATUS_LABELS: Record<Upload['status'], string> = {
  queued: 'en cola',
  checking: 'revisando',
  accepted: 'aceptado',
  rejected: 'rechazado',
};

export const REJECT_LABELS: Record<NonNullable<Upload['rejectReason']>, string> = {
  zip_bomb: 'Se expande de forma sospechosa al abrirlo (una «bomba zip»).',
  too_many_entries: 'Contiene demasiadas partes internas.',
  range_too_large: 'Es demasiado grande: máximo 50 000 filas y 200 columnas (en un PDF, 50 páginas).',
  corrupt: 'Está dañado o no cumple el formato que dice tener.',
  empty: 'No tiene datos (está vacío o solo trae encabezado).',
  worker_timeout: 'La revisión tardó demasiado y se canceló.',
  not_cfdi: 'No es un comprobante CFDI 3.3 o 4.0 válido (o alguno de los de un ZIP no lo es).',
  encrypted: 'El PDF está protegido o cifrado. Súbelo sin contraseña.',
  active_content: 'El PDF trae contenido activo (JavaScript, acciones o archivos incrustados) y no se abre.',
  no_text_layer: 'El PDF no tiene texto: parece un escaneo, y no se hace reconocimiento de imágenes (OCR).',
  no_table:
    'El PDF no tiene una tabla con líneas que se pueda leer. Si viene de una hoja de cálculo, sube el .xlsx o el .csv original (o expórtala con la cuadrícula).',
};

/** ¿Falta que el worker lo resuelva? Mientras sea así, la tabla se vuelve a leer sola. */
export const isPending = (u: Pick<Upload, 'status'>) => u.status === 'queued' || u.status === 'checking';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Revisión de cortesía ANTES de mandar el archivo (ahorra una subida inútil). No protege nada: la API vuelve a
 * revisar todo, por firma de bytes. Devuelve el mensaje, o '' si no hay nada que objetar.
 */
export function precheck(file: File | undefined): string {
  if (!file) return 'Elige un archivo.';
  if (!/\.(csv|xlsx|xml|zip|pdf)$/i.test(file.name)) {
    return 'Solo se admiten archivos .csv, .xlsx (sin macros), .xml (CFDI), .zip de CFDI y .pdf con una tabla.';
  }
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_BYTES) return 'El archivo pasa de 5 MB.';
  return '';
}

export const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
