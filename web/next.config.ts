import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false, // no anunciar "X-Powered-By: Next.js"
  // Las cabeceras de seguridad las pone Caddy, en un solo lugar (ver Caddyfile).
};

export default config;
