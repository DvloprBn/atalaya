// Pone la CSP en cada página (S-2). En Next 16 el antiguo «middleware» se llama proxy.
//
// Producción (CSP_ENFORCE=1): la política BLOQUEA. Desarrollo y CI: solo REPORTA, porque el modo dev usa eval y websockets
// y porque así una regresión de la CSP no tumba las pruebas de las demás cosas; igual se ve en el panel de seguridad.
// El nonce viaja también en la cabecera de la PETICIÓN: Next lo lee de ahí para marcar sus propios scripts y estilos.
import { type NextRequest, NextResponse } from 'next/server';
import { buildCsp, newNonce } from './lib/csp';

export function proxy(request: NextRequest) {
  const policy = buildCsp(newNonce(), { dev: process.env.NODE_ENV !== 'production' });
  const enforce = process.env.CSP_ENFORCE === '1';

  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', policy); // Next busca aquí el nonce, también en modo solo-reporte

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', policy);
  return response;
}

export const config = {
  // La API la sirve Nest (no lleva HTML), y los archivos estáticos no necesitan política propia.
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
