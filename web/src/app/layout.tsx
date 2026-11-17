import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Atalaya',
  description: 'Proyecto de estudio: acceso seguro y análisis de datos.',
  // Es un demo de estudio: que los buscadores no lo indexen.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
