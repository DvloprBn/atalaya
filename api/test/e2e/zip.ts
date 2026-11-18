// Un escritor de .zip mínimo (a mano) para fabricar archivos hostiles en las pruebas: una bomba (poco peso, mucho
// contenido), miles de entradas, XML malicioso. Node no trae escritor de zip y no se agrega una dependencia
// solo para probar. Formato: encabezado local + datos por entrada, directorio central y registro final.
import { crc32, deflateRawSync } from 'node:zlib';

export function makeZip(entries: Record<string, Buffer | string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = Buffer.from(content);
    const data = deflateRawSync(raw, { level: 9 });
    const nameBytes = Buffer.from(name);
    const common = Buffer.alloc(26); // versión, flags, método, hora, fecha, crc, tamaños, largos
    common.writeUInt16LE(20, 0);
    common.writeUInt16LE(0, 2);
    common.writeUInt16LE(8, 4); // 8 = deflate
    common.writeUInt16LE(0, 6);
    common.writeUInt16LE(0x21, 8); // 1980-01-01
    common.writeUInt32LE(crc32(raw), 10);
    common.writeUInt32LE(data.length, 14);
    common.writeUInt32LE(raw.length, 18);
    common.writeUInt16LE(nameBytes.length, 22);
    common.writeUInt16LE(0, 24);
    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), common, nameBytes, data]);
    const entry = Buffer.alloc(42); // como el local, más versión «hecha por», comentario, atributos y posición
    entry.writeUInt16LE(20, 0);
    common.copy(entry, 2, 0, 26);
    entry.writeUInt32LE(offset, 38);
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), entry, nameBytes]));
    parts.push(local);
    offset += local.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
export const sheet = (rows = 3) =>
  `<?xml version="1.0"?><worksheet ${NS}><sheetData>${Array.from({ length: rows }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i + 1}</v></c></row>`).join('')}</sheetData></worksheet>`;

/** Un libro mínimo pero real; `extra` agrega o pisa entradas. */
export function workbook(extra: Record<string, Buffer | string> = {}, sheetXml = sheet()): Buffer {
  return makeZip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>', 'xl/worksheets/sheet1.xml': sheetXml, ...extra });
}

type Cell = string | number | null;
const colName = (i: number) => String.fromCharCode(65 + i);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Un .xlsx que SÍ abre openpyxl (con sus relaciones y tipos de contenido completos), no el mínimo de `workbook()`.
 * Los textos van como `inlineStr` (sin tabla de textos compartidos) y los números como números.
 */
export function realWorkbook(rows: Cell[][]): Buffer {
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (value === null) return '';
          return typeof value === 'number' ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return makeZip({
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="Ventas" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="${main}"><sheetData>${sheetRows}</sheetData></worksheet>`,
  });
}
