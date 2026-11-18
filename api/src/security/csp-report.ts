import { clip } from './ip-hash.js';

/**
 * Convierte lo que manda el navegador en UN texto corto y seguro, o null si no es un reporte.
 * Hay dos formatos: el viejo (`report-uri`: {"csp-report": {...}}) y el nuevo (Reporting API:
 * [{type:"csp-violation", body:{...}}]). Del reporte se conserva SOLO la directiva violada y el
 * HOST bloqueado: la URL completa puede traer tokens o datos de la persona (p. ej. el
 * fragmento `#challenge=…` del login), y quien manda el reporte puede ser cualquiera.
 */
export function summarizeCspReport(body: unknown): string | null {
  const report = pick(body);
  if (!report) return null;
  const directive = text(report['effective-directive'] ?? report['effectiveDirective'] ?? report['violated-directive']);
  const blocked = text(report['blocked-uri'] ?? report['blockedURL'] ?? report['blockedUri']);
  if (!directive) return null;
  return clip(`${directive.split(/\s/)[0]} ${hostOf(blocked)}`, 120);
}

function pick(body: unknown): Record<string, unknown> | null {
  const first = Array.isArray(body) ? body[0] : body;
  if (!isObject(first)) return null;
  const inner = first['csp-report'] ?? first['body'];
  return isObject(inner) ? inner : null;
}

/** «inline», «eval», «data» y similares se dejan como están; una URL se reduce a su host. */
function hostOf(blocked: string): string {
  if (!blocked) return '-';
  try {
    const url = new URL(blocked);
    return url.host || url.protocol.replace(':', '');
  } catch {
    return blocked.replace(/[^a-z-]/gi, '').slice(0, 20) || '-';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
