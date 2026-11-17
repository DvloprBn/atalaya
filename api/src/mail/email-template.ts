// UNA sola plantilla para todos los correos (lección 192): quien manda un correo
// entrega TEXTO (título, párrafos, botón) y aquí se arma el HTML escapándolo todo.
// Así ningún dato (un correo escrito por el visitante, por ejemplo) se vuelve HTML.

export interface EmailContent {
  subject: string;
  title: string;
  paragraphs: string[];
  action?: { label: string; url: string };
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Una línea: un salto de línea en el asunto permitiría inyectar cabeceras de correo. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function renderEmail(content: EmailContent, appOrigin: string): RenderedEmail {
  const subject = oneLine(content.subject);
  const action = content.action;
  // Solo enlaces a NUESTRO sitio: un correo de Atalaya nunca manda a otro dominio.
  if (action && !action.url.startsWith(`${appOrigin}/`)) {
    throw new Error('El enlace de un correo debe apuntar al propio sitio');
  }

  const text = [
    content.title,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    '— Atalaya (proyecto de estudio)',
  ].join('\n');

  const html = [
    '<!doctype html><html lang="es"><body>',
    `<h1>${escapeHtml(content.title)}</h1>`,
    ...content.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    action ? `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>` : '',
    '<p>— Atalaya (proyecto de estudio)</p>',
    '</body></html>',
  ].join('');

  return { subject, text, html };
}
