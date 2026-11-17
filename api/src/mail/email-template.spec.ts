import { escapeHtml, renderEmail } from './email-template.js';

const ORIGIN = 'http://localhost:3070';
const HOSTILE = `<script>alert("x")</script>'&`;

describe('renderEmail', () => {
  it('escapa todo dato en el HTML, en cada campo (lección 69)', () => {
    const mail = renderEmail(
      {
        subject: HOSTILE,
        title: HOSTILE,
        paragraphs: [HOSTILE],
        action: { label: HOSTILE, url: `${ORIGIN}/x?a="><script>` },
      },
      ORIGIN,
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain(escapeHtml(HOSTILE));
  });

  it('deja el asunto en una sola línea (sin inyección de cabeceras)', () => {
    const mail = renderEmail({ subject: 'Hola\r\nBcc: victima@example.com', title: 't', paragraphs: [] }, ORIGIN);
    expect(mail.subject).toBe('Hola Bcc: victima@example.com');
  });

  it('rechaza un enlace a otro dominio, aunque empiece parecido', () => {
    const evil = { subject: 's', title: 't', paragraphs: [], action: { label: 'x', url: `${ORIGIN}.evil.com/` } };
    expect(() => renderEmail(evil, ORIGIN)).toThrow('propio sitio');
  });

  it('incluye versión de texto plano con el enlace', () => {
    const mail = renderEmail(
      { subject: 's', title: 'Título', paragraphs: ['Uno'], action: { label: 'Ir', url: `${ORIGIN}/a` } },
      ORIGIN,
    );
    expect(mail.text).toContain('Ir: http://localhost:3070/a');
  });
});
