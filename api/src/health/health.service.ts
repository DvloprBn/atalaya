import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

// Contrato interno con el worker (ver contracts/README.md): el worker escribe
// esta llave cada 10 s con vigencia de 30 s. Si la llave no existe, está caído.
export const WORKER_HEARTBEAT_KEY = 'atalaya:worker:heartbeat';
const PROBE_TIMEOUT_MS = 2000;

export type CheckState = 'ok' | 'down';
export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: { database: CheckState; redis: CheckState; worker: CheckState };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    // Las tres revisiones corren a la vez: el tiempo total es el de la más lenta.
    const [database, redis, worker] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.redis.client.ping()),
      probe(async () => {
        if (!(await this.redis.client.exists(WORKER_HEARTBEAT_KEY))) throw new Error('sin latido');
      }),
    ]);
    const checks = { database, redis, worker };
    const allOk = Object.values(checks).every((state) => state === 'ok');
    // Solo estados, nunca el mensaje del error: podría revelar hosts o versiones.
    return { status: allOk ? 'ok' : 'degraded', checks };
  }
}

async function probe(run: () => Promise<unknown>): Promise<CheckState> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS);
  });
  try {
    await Promise.race([run(), timeout]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
