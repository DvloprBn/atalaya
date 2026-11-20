import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

// next/font descarga las fuentes AL COMPILAR y las sirve desde este mismo sitio:
// el navegador del visitante nunca habla con Google (privacidad, y la CSP se
// queda en 'self'). Cada una queda en una variable CSS que usa globals.css.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-space-grotesk', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-jetbrains-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Atalaya',
  description: 'Proyecto de estudio: acceso seguro y análisis de datos de un negocio.',
  // Es un demo de estudio: que los buscadores no lo indexen.
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Renderizado dinámico a propósito (S-2): el nonce de la CSP es distinto en cada petición, y Next solo puede
  // ponérselo a sus scripts al renderizar con la petición delante. Una página estática se generaría sin nonce y
  // el navegador, con la CSP en bloqueo, no ejecutaría su JavaScript.
  await connection();
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
