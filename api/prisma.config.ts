// Configuración de Prisma 7. La URL de la base NO vive en el schema: la pone
// docker-compose como variable de entorno dentro del contenedor.
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env['DATABASE_URL'] },
});
