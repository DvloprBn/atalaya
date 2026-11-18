import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { clip, hashIp } from './ip-hash.js';

export type SecurityEventType =
  | 'login_failed'
  | 'login_locked'
  | 'two_factor_failed'
  | 'refresh_reuse'
  | 'google_rejected'
  | 'rate_limited'
  | 'csp_violation';

export interface EventInput {
  userId?: string | null;
  /** La IP del visitante (req.ip). Se guarda solo su HMAC. */
  ip?: string;
  detail?: string;
  /** Tipos ruidosos (tope, CSP): un mismo hecho desde un mismo lugar se escribe una vez por minuto. */
  dedupe?: boolean;
}

const RETENTION_DAYS = 90;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
const DEDUPE_TTL_S = 60;

/**
 * Lo ÚNICO que escribe la bitácora. Dos reglas que no se rompen:
 * 1. Registrar NUNCA rompe la petición: un fallo aquí se anota en el log y se sigue. Una bitácora
 *    caída no puede convertirse en una forma de tumbar el login.
 * 2. Un atacante no puede llenar el disco: los tipos ruidosos se deduplican, todo texto se recorta
 *    y lo anterior a 90 días se borra solo (OWASP API4: consumo sin tope de recursos).
 */
@Injectable()
export class SecurityLog implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SecurityLog.name);
  private readonly key = loadEnv().jwtSecret;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    void this.purge();
    this.timer = setInterval(() => void this.purge(), PURGE_EVERY_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async record(type: SecurityEventType, input: EventInput = {}): Promise<void> {
    try {
      const ipHash = hashIp(input.ip, this.key);
      const detail = clip(input.detail, 120);
      if (input.dedupe && !(await this.firstThisMinute(type, ipHash, detail))) return;
      await this.prisma.securityEvent.create({ data: { type, userId: input.userId ?? null, ipHash, detail } });
    } catch (error) {
      this.log.error(`no se pudo registrar ${type}: ${error instanceof Error ? error.name : 'error'}`);
    }
  }

  /** SET NX con vigencia: atómico, y la llave se borra sola. */
  private async firstThisMinute(type: string, ipHash: string | null, detail: string | null): Promise<boolean> {
    const key = `atalaya:sec-dedupe:${type}:${ipHash ?? '-'}:${detail ?? '-'}`;
    return (await this.redis.client.set(key, '1', 'EX', DEDUPE_TTL_S, 'NX')) === 'OK';
  }

  /** Público para las pruebas: borra lo que pasó el tiempo de retención. */
  async purge(now = new Date()): Promise<void> {
    try {
      const before = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await this.prisma.securityEvent.deleteMany({ where: { createdAt: { lt: before } } });
      await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: before } } });
    } catch (error) {
      this.log.error(`no se pudo podar la bitácora: ${error instanceof Error ? error.name : 'error'}`);
    }
  }
}

