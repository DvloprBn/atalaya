// La Content-Security-Policy de Atalaya (S-2). Una función pura: recibe el nonce de ESTA petición y devuelve la política.
//
// Por qué un nonce y no 'unsafe-inline': con 'unsafe-inline' en script-src, un XSS que inyecte <script>…</script>
// se ejecuta igual y la CSP no sirve de nada. Con nonce, solo corre el script que lleve el valor secreto de esta
// respuesta (Next lo pone solo en los suyos). 'strict-dynamic' deja que esos scripts de confianza carguen los demás.
//
// Estilos: los <style> llevan nonce, pero los atributos style="…" de React (hay muchos) quedan permitidos aparte con
// style-src-attr. Un atributo de estilo no ejecuta código; exigir nonce ahí obligaría a reescribir toda la interfaz.

export interface CspOptions {
  /** Desarrollo: React necesita eval() para sus mensajes de depuración y Next abre un websocket para recargar. */
  dev: boolean;
}

export function buildCsp(nonce: string, { dev }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'", // next/font sirve las fuentes desde este mismo sitio
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report', // el recolector de la v0.7: seguimos viendo lo que el navegador bloquee
  ];
  return directives.join('; ');
}

/** Un valor impredecible por petición (128 bits de azar), en base64 como pide la sintaxis 'nonce-…'. */
export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}
