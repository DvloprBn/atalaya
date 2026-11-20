import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { DemoService } from '../demo/demo.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { toAnalysis } from './analysis-view.js';
import { type MappingInput, mappingProblem, normalizeMapping } from './mapping.js';
import { type ResultKind, ResultsStorage } from './results-storage.js';
import { randomUUID } from 'node:crypto';

export const MAX_ANALYSES_PER_ACCOUNT = 10;
/** La cola de análisis (Redis Stream). Como en las subidas, el mensaje lleva SOLO el id; el estado dice qué toca hacer. */
export const ANALYSIS_STREAM = 'atalaya:analyses';
const PAGE_SIZE = 20;

@Injectable()
export class AnalysesService {
  private readonly log = new Logger(AnalysesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly results: ResultsStorage,
    private readonly demo: DemoService,
  ) {}

  /** Paso 1: empieza el análisis de un archivo mío ya aceptado. El worker prepara la vista previa. */
  async create(user: AuthUser, uploadId: string, kind: 'sales' | 'expenses' = 'sales') {
    // Un archivo ajeno responde 404, igual que uno que no existe (OWASP API1).
    const upload = await this.prisma.upload.findFirst({ where: { id: uploadId, ownerId: user.id, deleteRequestedAt: null } });
    if (!upload) throw new NotFoundException();
    if (upload.status !== 'accepted') throw new ConflictException('El archivo todavía no pasó la revisión (o fue rechazado)');

    // Cupo de 24 h de la demo (20): borrar un análisis no lo devuelve. Si el análisis no llega a crearse, sí.
    await this.demo.consume('analyses', user.id);
    try {
      return await this.start(user, uploadId, kind);
    } catch (error) {
      await this.demo.refund('analyses', user.id);
      throw error;
    }
  }

  private async start(user: AuthUser, uploadId: string, kind: 'sales' | 'expenses') {
    let analysis;
    try {
      analysis = await this.prisma.$transaction(async (tx) => {
        // Candado por cuenta: dos peticiones simultáneas no pueden contar «9» a la vez y pasar las dos.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`analysis:${user.id}`}, 0))`;
        if ((await tx.analysis.count({ where: { ownerId: user.id } })) >= MAX_ANALYSES_PER_ACCOUNT) {
          throw new ConflictException(`Máximo ${MAX_ANALYSES_PER_ACCOUNT} análisis por cuenta: borra alguno antes de empezar otro`);
        }
        // La llave de los archivos de resultados la pone la API; el worker nunca inventa nombres de archivo.
        return tx.analysis.create({ data: { ownerId: user.id, uploadId, kind, resultKey: randomUUID().replaceAll('-', '') } });
      });
    } catch (error) {
      // El archivo se borró entre leerlo y crear el análisis: es un «no existe», no un fallo del servidor.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new NotFoundException();
      throw error;
    }
    await this.enqueueOrUndo(analysis.id, () => this.prisma.analysis.delete({ where: { id: analysis.id } }));
    return toAnalysis(analysis);
  }

  async list(user: AuthUser, page = 1) {
    const where = { ownerId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.analysis.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.analysis.count({ where }),
    ]);
    return { items: rows.map(toAnalysis), page, pageSize: PAGE_SIZE, total };
  }

  async get(user: AuthUser, id: string) {
    return toAnalysis(await this.mine(user, id));
  }

  /** Paso 2: la persona confirma qué columna es cada campo; el worker limpia el archivo. */
  async putMapping(user: AuthUser, id: string, dto: MappingInput) {
    const row = await this.mine(user, id);
    if (row.status !== 'awaiting_mapping') throw new ConflictException('Este análisis no está esperando el mapeo de columnas');
    const columns = (row.preview as { columns?: unknown[] } | null)?.columns;
    const problem = mappingProblem(dto, Array.isArray(columns) ? columns.length : 0);
    if (problem) throw new BadRequestException(problem);

    // Condicionado al estado en la propia sentencia: dos confirmaciones a la vez no encolan dos veces.
    const moved = await this.prisma.analysis.updateMany({
      where: { id, ownerId: user.id, status: 'awaiting_mapping' },
      data: { mapping: normalizeMapping(dto), status: 'queued' },
    });
    if (moved.count !== 1) throw new ConflictException('Este análisis no está esperando el mapeo de columnas');
    await this.enqueueOrUndo(id, () =>
      this.prisma.analysis.updateMany({ where: { id }, data: { mapping: Prisma.DbNull, status: 'awaiting_mapping' } }),
    );
    return toAnalysis(await this.mine(user, id));
  }

  /** Borra el análisis y sus CSV. Si el worker lo estaba procesando, él ve que ya no existe y borra lo que escribió. */
  async remove(user: AuthUser, id: string) {
    const row = await this.mine(user, id);
    await this.prisma.analysis.deleteMany({ where: { id, ownerId: user.id } });
    await this.results.removeAll(row.resultKey);
    return { message: 'Análisis borrado' };
  }

  /** Un CSV de resultados, solo con el análisis terminado. */
  async exportFile(user: AuthUser, id: string, kind: ResultKind) {
    const row = await this.mine(user, id);
    if (row.status !== 'done') throw new ConflictException('El análisis todavía no termina');
    const file = await this.results.open(row.resultKey, kind);
    if (!file) throw new NotFoundException('El resultado ya no está disponible');
    return file;
  }

  /** Mío, o 404: el de otra cuenta y el que no existe son indistinguibles (también para un admin). */
  private async mine(user: AuthUser, id: string) {
    const row = await this.prisma.analysis.findFirst({ where: { id, ownerId: user.id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  /** Una fila «en cola» que nadie va a procesar es peor que un error claro: si no se pudo encolar, se deshace. */
  private async enqueueOrUndo(id: string, undo: () => Promise<unknown>) {
    try {
      await this.redis.client.xadd(ANALYSIS_STREAM, 'MAXLEN', '~', 10_000, '*', 'id', id);
    } catch (error) {
      this.log.error(`No se pudo encolar el análisis ${id}: ${(error as Error).message}`);
      await undo();
      throw new ServiceUnavailableException('No se pudo encolar el análisis; intenta de nuevo');
    }
  }
}
