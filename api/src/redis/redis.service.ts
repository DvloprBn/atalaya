import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { loadEnv } from '../config/env.js';

// Redis guarda datos de vida corta: el latido del worker (v0.1), los topes de
// peticiones y los tokens de un solo uso (v0.2+) y la cola de análisis (v0.7).
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(loadEnv().redisUrl, {
    // Si Redis no responde, falla rápido en vez de encolar comandos sin fin.
    maxRetriesPerRequest: 1,
  });

  async onModuleDestroy() {
    await this.client.quit();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
