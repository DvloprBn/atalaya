import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
// Prisma 7: el cliente se genera dentro del proyecto (no en @prisma/client).
// La extensión .js es obligatoria en imports relativos de un proyecto ESM.
import { PrismaClient } from '../generated/prisma/client.js';
// Prisma 7 necesita un "driver adapter": este habla con Postgres mediante `pg`.
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: loadEnv().databaseUrl }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// @Global: un solo cliente (un solo pool de conexiones) para toda la API.
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
