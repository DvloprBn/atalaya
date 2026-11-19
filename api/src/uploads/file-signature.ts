// ¿Qué es REALMENTE este archivo? Se decide por sus BYTES, no por la extensión ni por el Content-Type
// (los dos los escribe quien sube el archivo). La extensión solo sirve para una cosa: que COINCIDA con lo que
// los bytes dicen; si no coincide, se rechaza (un .xlsx que no es un zip, un zip llamado .csv).
//
// Esto es la revisión BARATA de la API. La profunda (bomba zip, rangos, XML) la hace el worker.

export type UploadKind = 'csv' | 'xlsx';
export type Verdict = { ok: true; kind: UploadKind } | { ok: false; message: string };

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\3\4": todo .xlsx es un zip
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // .xls antiguo (con macros posibles)

// Un CSV no tiene firma, así que se descartan las firmas de lo que NO es un CSV.
const NOT_CSV = ['%PDF-', 'MZ', '\x7fELF', 'GIF8', '\x89PNG', '\xff\xd8\xff', '<?xml', '<!doc', '<html'];

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** La extensión del último tramo del nombre, en minúsculas ('' si no hay). */
export function extensionOf(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export function checkSignature(originalName: string, bytes: Buffer): Verdict {
  const ext = extensionOf(originalName);
  if (ext !== 'csv' && ext !== 'xlsx') {
    // .xlsm, .xlsb y .xls caen aquí a propósito: sus formatos admiten macros.
    return { ok: false, message: 'Solo se admiten archivos .csv y .xlsx (sin macros)' };
  }
  if (bytes.subarray(0, 8).equals(OLE)) return { ok: false, message: 'Ese formato antiguo de Excel (.xls) no se admite' };

  const isZip = bytes.subarray(0, 4).equals(ZIP);
  if (ext === 'xlsx') {
    if (!isZip) return { ok: false, message: 'El contenido no es un libro de Excel (.xlsx)' };
    // Los nombres internos de un zip van en claro: una búsqueda barata separa un .xlsx de otro zip cualquiera.
    if (bytes.includes('vbaProject.bin')) return { ok: false, message: 'El libro contiene macros; no se admite' };
    if (!bytes.includes('[Content_Types].xml') || !bytes.includes('xl/workbook.xml')) {
      return { ok: false, message: 'El contenido no es un libro de Excel (.xlsx)' };
    }
    return { ok: true, kind: 'xlsx' };
  }

  // ext === 'csv'
  if (isZip) return { ok: false, message: 'El contenido es un archivo comprimido, no un CSV' };
  const head = bytes.subarray(0, 16).toString('latin1').toLowerCase();
  if (NOT_CSV.some((sig) => head.startsWith(sig.toLowerCase()))) {
    return { ok: false, message: 'El contenido no es un CSV' };
  }
  if (bytes.includes(0)) return { ok: false, message: 'El contenido no es texto (tiene bytes nulos)' };
  try {
    utf8.decode(bytes);
  } catch {
    return { ok: false, message: 'El CSV debe estar codificado en UTF-8' };
  }
  return { ok: true, kind: 'csv' };
}

/**
 * Nombre para MOSTRARLE a su dueño: último tramo, sin caracteres de control ni de formato, sin espacios
 * repetidos, máximo 100 caracteres. Nunca se usa como ruta (el archivo se guarda con un nombre generado).
 */
export function displayNameOf(originalName: string): string | null {
  // multer entrega el nombre leído como latin1; si era UTF-8 se vería «Ã±»: se corrige.
  // Solo si TODO cabe en latin1: con un carácter mayor (p. ej. U+202E) la reconversión lo truncaría.
  const fixed = [...originalName].every((c) => c.codePointAt(0)! <= 0xff) ? Buffer.from(originalName, 'latin1').toString('utf8') : originalName;
  const name = (fixed.includes('\ufffd') ? originalName : fixed).normalize('NFC');
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim();
  return clean === '' ? null : [...clean].slice(0, 100).join('');
}
