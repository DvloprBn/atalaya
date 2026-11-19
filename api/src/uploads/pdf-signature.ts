// La puerta BARATA de un `.pdf`: firma, cifrado y contenido activo que se ve en los bytes. Lo profundo (estructura,
// páginas, texto, tablas, y lo que aquí no se ve) lo hace el worker en un proceso aparte con tope de tiempo y memoria.
//
// Un PDF guarda sus diccionarios como texto: `/Encrypt`, `/JavaScript`… son NOMBRES que, si van a la vista, se
// encuentran con una búsqueda. Dos formas de esconderlos que esta puerta NO ve, a propósito (las ve el worker, que
// lee el PDF ya interpretado): un nombre con escapes (`/J#61vaScript` es `/JavaScript`) y un diccionario metido en
// un flujo de objetos comprimido. Buscar más aquí sería escribir un lector de PDF en la API.

export type PdfVerdict = { ok: true } | { ok: false; message: string };

// `%PDF-1.x` o `%PDF-2.0` desde el byte 0. La norma tolera basura antes de la firma; aquí no: un reporte exportado
// la trae al inicio, y la basura previa es la forma de hacer archivos políglotas (que valen como dos formatos).
const SIGNATURE = /^%PDF-[12]\.\d/;

// Un nombre de PDF termina en un espacio o en un delimitador: así `/JS` no atrapa `/JSON` ni `/JStyle`.
// Las mayúsculas importan: los nombres de PDF distinguen entre ellas.
const END = String.raw`(?=[\s()<>\[\]{}/%]|$)`;
const ENCRYPT = new RegExp(String.raw`/Encrypt${END}`);
// Lo que ejecuta código, abre otros programas o trae archivos adentro. Un reporte de ventas no necesita nada de esto
// (la misma postura que con las macros de un `.xlsm`). `/EmbeddedFiles` (el índice) cae por `/EmbeddedFile` + `s`.
const ACTIVE = new RegExp(String.raw`/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|XFA)${END}`);

export function checkPdf(bytes: Buffer): PdfVerdict {
  // latin1 convierte cada byte en un carácter, sin fallar con binario: la búsqueda ve los bytes tal cual.
  const text = bytes.toString('latin1');
  if (!SIGNATURE.test(text)) return { ok: false, message: 'El contenido no es un PDF' };
  if (ENCRYPT.test(text)) return { ok: false, message: 'El PDF está protegido o cifrado; súbelo sin contraseña' };
  if (ACTIVE.test(text)) {
    return { ok: false, message: 'El PDF trae contenido activo (JavaScript, acciones o archivos incrustados); no se admite' };
  }
  return { ok: true };
}
