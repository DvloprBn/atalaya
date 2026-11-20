import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone', // la imagen de producción (web/Dockerfile) lleva solo lo que el servidor usa
  poweredByHeader: false, // no anunciar "X-Powered-By: Next.js"
  // Las cabeceras de seguridad las pone Caddy, en un solo lugar (ver Caddyfile).
};

export default config;
