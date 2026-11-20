// v1.0 · El borrado de la demo (PLAN_DESARROLLO.md §6): al arrancar y cada 15 minutos, cada cuenta vencida se va
// con TODO lo suyo. La base borra en cascada las filas (sesiones, 2FA, archivos, análisis…); los BYTES del disco no
// los conoce la base, así que se quitan aquí, ANTES de la fila: si la API se cae a la mitad, en la próxima vuelta la
// fila sigue ahí y se reintenta (al revés quedarían archivos huérfanos que ninguna fila recuerda).
//
// Sin candado entre instancias: cada paso es idempotente (borrar lo que ya no existe no falla, y `deleteMany`
// condicionado a «sigue vencida» no puede borrar dos veces).
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { loadEnv } from '../config/env.js';
import { ResultsStorage } from '../analyses/results-storage.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadStorage } from '../uploads/upload-storage.js';

const EVERY_MS = 15 * 60 * 1000;
const BATCH = 100;

@Injectable()
export class DemoSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Demo');
  private readonly config = loadEnv().demo;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadStorage,
    private readonly results: ResultsStorage,
  ) {}

  onModuleInit() {
    if (!this.config) return;
    void this.sweep(); // «y al arrancar»: lo que venció con la API apagada no espera 15 minutos más
    // Con la vida corta de desarrollo y CI se barre más seguido (la mitad de la vida); en producción, cada 15 min.
    const every = Math.max(1_000, Math.min(EVERY_MS, (this.config.accountTtlS * 1000) / 2));
    this.timer = setInterval(() => void this.sweep(), every);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Borra hasta 100 cuentas vencidas por vuelta. Devuelve cuántas borró (para las pruebas). */
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0; // una vuelta lenta no se encima con la siguiente del mismo proceso
    this.running = true;
    let deleted = 0;
    try {
      const expired = await this.prisma.user.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: BATCH,
      });
      for (const { id } of expired) if (await this.deleteAccount(id, now)) deleted++;
      if (deleted > 0) this.log.log(`Barrido de la demo: ${deleted} cuenta(s) vencida(s) borrada(s).`);
    } catch {
      // Sin datos de cuentas en el log. Nada queda a medias que la próxima vuelta no pueda terminar.
      this.log.error('Falló el barrido de la demo; se reintenta en la próxima vuelta.');
    } finally {
      this.running = false;
    }
    return deleted;
  }

  private async deleteAccount(userId: string, now: Date): Promise<boolean> {
    // Un archivo que el worker está revisando ahora mismo: se marca (el worker descarta su resultado) y la cuenta
    // espera a la próxima vuelta. Ya no puede entrar, así que esperar no le da nada a nadie.
    const checking = await this.prisma.upload.updateMany({
      where: { ownerId: userId, status: 'checking' },
      data: { deleteRequestedAt: now },
    });
    if (checking.count > 0) return false;

    const [files, analyses] = await Promise.all([
      this.prisma.upload.findMany({ where: { ownerId: userId }, select: { storageKey: true } }),
      this.prisma.analysis.findMany({ where: { ownerId: userId }, select: { resultKey: true } }),
    ]);
    for (const f of files) await this.uploads.remove(f.storageKey);
    // Si un análisis está corriendo, el worker escribe sus CSV después de esto, ve que su fila ya no existe y los borra.
    for (const a of analyses) await this.results.removeAll(a.resultKey);

    // «Sigue vencida» en la misma sentencia: si alguien la hubiera hecho permanente entre medias, no se borra.
    const gone = await this.prisma.user.deleteMany({ where: { id: userId, expiresAt: { lte: now } } });
    return gone.count === 1;
  }
}
