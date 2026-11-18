import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { manageableLevels } from '../admin/hierarchy.js';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { checkSignature, displayNameOf } from './file-signature.js';
import { toAdminUpload, toUpload } from './upload-view.js';
import { UploadStorage } from './upload-storage.js';

export const MAX_BYTES = 5 * 1024 * 1024; // el mismo 5 MB del contrato y del CHECK de la base
export const MAX_FILES_PER_ACCOUNT = 10;
/** La cola (Redis Stream). El mensaje lleva SOLO el id: el worker lee el resto de la base y los bytes del volumen. */
export const UPLOAD_STREAM = 'atalaya:uploads';
const PAGE_SIZE = 20;
const REAP_EVERY_MS = 60_000;

@Injectable()
export class UploadsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(UploadsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: UploadStorage,
  ) {}

  onModuleInit() {
    void this.reap();
    this.timer = setInterval(() => void this.reap(), REAP_EVERY_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async create(user: AuthUser, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Falta el archivo (campo «file»)');
    if (file.size === 0) throw new BadRequestException('El archivo está vacío');
    const verdict = checkSignature(file.originalname, file.buffer);
    if (!verdict.ok) throw new UnsupportedMediaTypeException(verdict.message);

    const storageKey = randomUUID().replaceAll('-', ''); // el nombre en disco lo pone el servidor
    await this.storage.save(storageKey, file.buffer);

    let upload;
    try {
      upload = await this.prisma.$transaction(async (tx) => {
        // Candado por cuenta: dos subidas simultáneas no pueden contar «9» a la vez y pasar las dos.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`upload:${user.id}`}, 0))`;
        const count = await tx.upload.count({ where: { ownerId: user.id, deleteRequestedAt: null } });
        if (count >= MAX_FILES_PER_ACCOUNT) {
          throw new ConflictException(`Máximo ${MAX_FILES_PER_ACCOUNT} archivos por cuenta: borra alguno antes de subir otro`);
        }
        return tx.upload.create({
          data: {
            ownerId: user.id,
            kind: verdict.kind,
            displayName: displayNameOf(file.originalname),
            sizeBytes: file.size,
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
            storageKey,
          },
        });
      });
    } catch (error) {
      await this.storage.remove(storageKey); // sin fila no debe quedar el archivo
      throw error;
    }

    try {
      await this.redis.client.xadd(UPLOAD_STREAM, 'MAXLEN', '~', 10_000, '*', 'id', upload.id);
    } catch (error) {
      // Una fila «en cola» que nadie va a procesar es peor que un error claro: se deshace todo.
      this.log.error(`No se pudo encolar ${upload.id}: ${(error as Error).message}`);
      await this.prisma.upload.delete({ where: { id: upload.id } });
      await this.storage.remove(storageKey);
      throw new ServiceUnavailableException('No se pudo encolar el archivo; intenta de nuevo');
    }
    return toUpload(upload);
  }

  async list(user: AuthUser, page = 1) {
    const where = { ownerId: user.id, deleteRequestedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.upload.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.upload.count({ where }),
    ]);
    return { items: rows.map(toUpload), page, pageSize: PAGE_SIZE, total };
  }

  /** Un archivo ajeno responde 404, igual que uno que no existe: ni se confirma que existe (OWASP API1). */
  async get(user: AuthUser, id: string) {
    const row = await this.prisma.upload.findFirst({ where: { id, ownerId: user.id, deleteRequestedAt: null } });
    if (!row) throw new NotFoundException();
    return toUpload(row);
  }

  async remove(user: AuthUser, id: string) {
    const mine = { id, ownerId: user.id, deleteRequestedAt: null };
    const row = await this.prisma.upload.findFirst({ where: mine });
    if (!row) throw new NotFoundException();
    // Si el worker lo está revisando solo se MARCA: el worker descarta su resultado y la poda borra la fila y el archivo.
    // Condicionado al estado en la propia sentencia: si cambió entre leer y escribir, no se borra lo que no se vio.
    const deleted = await this.prisma.upload.deleteMany({ where: { ...mine, status: { not: 'checking' } } });
    if (deleted.count === 1) await this.storage.remove(row.storageKey);
    else await this.prisma.upload.updateMany({ where: mine, data: { deleteRequestedAt: new Date() } });
    return { message: 'Archivo borrado' };
  }

  /** Metadatos de las cuentas de nivel menor al de quien pregunta (misma regla de visibilidad que adminListUsers). */
  async adminList(actor: AuthUser, page = 1) {
    const where = { deleteRequestedAt: null, owner: { role: { level: manageableLevels(actor.role.level) } } };
    const [rows, total] = await Promise.all([
      this.prisma.upload.findMany({
        where,
        include: { owner: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.upload.count({ where }),
    ]);
    return { items: rows.map(toAdminUpload), page, pageSize: PAGE_SIZE, total };
  }

  /** Quita filas y archivos con borrado pedido cuyo worker ya terminó. Un fallo se anota y se reintenta en un minuto. */
  private async reap(): Promise<void> {
    try {
      const rows = await this.prisma.upload.findMany({
        where: { deleteRequestedAt: { not: null }, status: { not: 'checking' } },
        select: { id: true, storageKey: true },
        take: 100,
      });
      for (const row of rows) {
        await this.prisma.upload.deleteMany({ where: { id: row.id, status: { not: 'checking' } } });
        await this.storage.remove(row.storageKey);
      }
    } catch (error) {
      this.log.warn(`Poda de subidas: ${(error as Error).message}`);
    }
  }
}
