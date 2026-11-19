// Un generador de PDF mínimo para las pruebas e2e: el mismo diseño que `worker/tests/pdf_maker.py`, escrito aparte.
// Cada página es una lista de bloques: ['table', filas] dibuja una tabla con líneas, ['text', línea] escribe texto
// suelto y ['lines'] solo dibuja (una página sin texto, como un escaneo).
import { once } from 'node:events';
import { createDeflate, deflateSync } from 'node:zlib';

export type Block = ['table', string[][]] | ['text', string] | ['lines'];
type Options = { catalogExtra?: string; rawContent?: Buffer; extraObjects?: Buffer[]; withXref?: boolean };

const W = 612;
const H = 792;
const LEFT = 50;
const ROW = 20;
const b = (s: string) => Buffer.from(s, 'latin1'); // latin1 = WinAnsi para acentos y ñ
const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

function table(rows: string[][], top: number): [string, number] {
  const cols = Math.max(...rows.map((r) => r.length));
  const width = (W - 2 * LEFT) / cols;
  const bottom = top - ROW * rows.length;
  const out = ['0.5 w'];
  for (let i = 0; i <= rows.length; i++) out.push(`${LEFT} ${top - i * ROW} m ${W - LEFT} ${top - i * ROW} l S`);
  for (let j = 0; j <= cols; j++) out.push(`${LEFT + j * width} ${top} m ${LEFT + j * width} ${bottom} l S`);
  rows.forEach((row, i) =>
    row.forEach((cell, j) => out.push(`BT /F1 9 Tf ${LEFT + j * width + 4} ${top - (i + 1) * ROW + 6} Td (${esc(cell)}) Tj ET`)),
  );
  return [out.join('\n'), bottom - 30];
}

function content(blocks: Block[]): Buffer {
  const parts: string[] = [];
  let top = H - 50;
  for (const block of blocks) {
    if (block[0] === 'table') {
      const [drawn, next] = table(block[1], top);
      parts.push(drawn);
      top = next;
    } else if (block[0] === 'text') {
      parts.push(`BT /F1 11 Tf ${LEFT} ${top} Td (${esc(block[1])}) Tj ET`);
      top -= 20;
    } else parts.push('1 w 50 700 m 500 700 l S 50 600 m 500 600 l S');
  }
  const data = deflateSync(b(parts.join('\n')));
  return Buffer.concat([b(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), data, b('\nendstream')]);
}

export function makePdf(pages: Block[][], o: Options = {}): Buffer {
  const pageIds = pages.map((_, i) => 4 + 2 * i);
  const objects: Buffer[] = [
    b(`<< /Type /Catalog /Pages 2 0 R ${o.catalogExtra ?? ''} >>`),
    b(`<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pages.length} >>`),
    b('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
  ];
  pages.forEach((blocks, i) => {
    objects.push(b(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`));
    objects.push(i === 0 && o.rawContent ? o.rawContent : content(blocks));
  });
  objects.push(...(o.extraObjects ?? []));
  const chunks = [b('%PDF-1.7\n'), Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let size = chunks.reduce((n, c) => n + c.length, 0);
  const offsets: number[] = [];
  objects.forEach((body, n) => {
    offsets.push(size);
    const obj = Buffer.concat([b(`${n + 1} 0 obj\n`), body, b('\nendobj\n')]);
    chunks.push(obj);
    size += obj.length;
  });
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  if (o.withXref === false) return Buffer.concat([...chunks, b(`${trailer}%%EOF\n`)]);
  const xref = offsets.map((off) => `${String(off).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.concat([...chunks, b(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}${trailer}startxref\n${size}\n%%EOF\n`)]);
}

/** Un flujo de objetos COMPRIMIDO con un solo objeto: así un diccionario queda escondido de una búsqueda de bytes. */
export function objectStream(body: string, objid: number): Buffer {
  const head = `${objid} 0 `;
  const data = deflateSync(b(head + body));
  return Buffer.concat([b(`<< /Type /ObjStm /N 1 /First ${head.length} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`), data, b('\nendstream')]);
}

/** Un flujo de contenido que pesa poco y se descomprime a `megabytes` MB de ceros (se arma por partes: sin ocupar esa RAM aquí). */
export async function bombStream(megabytes: number): Promise<Buffer> {
  const deflate = createDeflate({ level: 9 });
  const parts: Buffer[] = [];
  deflate.on('data', (c: Buffer) => parts.push(c));
  const zero = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < megabytes; i++) if (!deflate.write(zero)) await once(deflate, 'drain');
  deflate.end();
  await once(deflate, 'end');
  const data = Buffer.concat(parts);
  return Buffer.concat([b(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), data, b('\nendstream')]);
}

export const VENTAS = [
  ['Fecha', 'Producto', 'Cantidad', 'Importe'],
  ['2026-03-01', 'Latte', '2', '104.00'],
  ['2026-03-01', 'Croissant', '1', '42.00'],
  ['2026-03-02', 'Café de olla', '3', '105.00'],
];
