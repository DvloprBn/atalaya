// v1.0 · Las reglas de la demo de 24 h (PLAN_DESARROLLO.md §6) que se consultan a media petición:
// la vigencia de una cuenta nueva, el tope global de cuentas de prueba y los cupos de 24 h por cuenta.
// El borrado de lo vencido vive aparte (demo-sweeper.ts). Sin demo (DEMO_MODE=false) todo aquí es un «sí» sin efecto.
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MAX_BYTES, MAX_FILES_PER_ACCOUNT } from '../uploads/limits.js';
import { RedisService } from '../redis/redis.service.js';

type Tx = Prisma.TransactionClient;
export type QuotaKind = 'uploads' | 'analyses';

/** Lo que la pantalla puede saber de la demo antes de tener cuenta (GET /api/demo). Nada de cuántas cuentas hay. */
export interface DemoInfo {
  enabled: boolean;
  accountHours: number;
  limits: { files: number; megabytes: number; rows: number; uploadsPerDay: number; analysesPerDay: number } | null;
}

const ROWS = 50_000; // lo impone el worker (worker/atalaya_worker/limits.py, MAX_ROWS); aquí solo se anuncia
const DAY_S = 24 * 60 * 60;
export const DEMO_FULL = 'La demo está llena en este momento. Las cuentas de prueba se borran a las 24 horas: vuelve a intentarlo más tarde.';

@Injectable()
export class DemoService {
  private readonly config = loadEnv().demo;

  constructor(private readonly redis: RedisService) {}

  get enabled(): boolean {
    return this.config !== null;
  }

  info(): DemoInfo {
    const c = this.config;
    if (!c) return { enabled: false, accountHours: 0, limits: null };
    return {
      enabled: true,
      accountHours: c.accountTtlS / 3600,
      limits: {
        files: MAX_FILES_PER_ACCOUNT,
        megabytes: MAX_BYTES / (1024 * 1024),
        rows: ROWS,
        uploadsPerDay: c.uploadsPerDay,
        analysesPerDay: c.analysesPerDay,
      },
    };
  }

  /**
   * Se llama DENTRO de la transacción que crea una cuenta (registro, Google o invitación). Devuelve su fecha de
   * borrado, o null sin demo. El candado hace que dos altas simultáneas no puedan contar «49» a la vez y pasar las dos.
   * La excepción deshace la transacción entera: el enlace de registro NO se gasta y sirve para reintentar más tarde.
   */
  async reserveSeat(tx: Tx): Promise<Date | null> {
    if (!this.config) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('demo:accounts', 0))`;
    if ((await this.activeAccounts(tx)) >= this.config.maxAccounts) throw new ServiceUnavailableException(DEMO_FULL);
    return new Date(Date.now() + this.config.accountTtlS * 1000);
  }

  /** Aviso temprano al registrarse (sin candado: la palabra final la tiene reserveSeat). No dice nada de nadie. */
  async assertNotFull(tx: Tx): Promise<void> {
    if (this.config && (await this.activeAccounts(tx)) >= this.config.maxAccounts) throw new ServiceUnavailableException(DEMO_FULL);
  }

  /**
   * Gasta una unidad del cupo de 24 h. INCR es atómico: dos peticiones a la vez nunca cuentan el mismo número.
   * El cupo NO se devuelve al borrar un archivo o un análisis (eso es justo lo que el tope impide); solo con `refund`,
   * cuando la acción misma no llegó a ocurrir.
   */
  async consume(kind: QuotaKind, userId: string): Promise<void> {
    if (!this.config) return;
    const limit = kind === 'uploads' ? this.config.uploadsPerDay : this.config.analysesPerDay;
    const key = this.key(kind, userId);
    const [[, used]] = (await this.redis.client.multi().incr(key).expire(key, DAY_S, 'NX').exec()) as [[null, number]];
    if (used > limit) {
      const what = kind === 'uploads' ? 'subidas' : 'análisis';
      throw new HttpException(`En la demo caben ${limit} ${what} cada 24 horas: llegaste al tope.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async refund(kind: QuotaKind, userId: string): Promise<void> {
    if (this.config) await this.redis.client.decr(this.key(kind, userId));
  }

  /** Las vivas: las vencidas aún no barridas ya no ocupan lugar (no entran, y en minutos desaparecen). */
  private activeAccounts(tx: Tx): Promise<number> {
    return tx.user.count({ where: { expiresAt: { gt: new Date() } } });
  }

  private key(kind: QuotaKind, userId: string): string {
    return `atalaya:demo:${kind}:${userId}`;
  }
}
