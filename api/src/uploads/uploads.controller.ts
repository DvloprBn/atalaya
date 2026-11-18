import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { LEVEL, MinLevel } from '../common/auth/min-level.decorator.js';
import { scaled } from '../common/http/throttle.js';
import { PageQuery } from './dto.js';
import { MAX_BYTES, UploadsService } from './uploads.service.js';
import { UploadStorage } from './upload-storage.js';

// Límites de multer: se aplican MIENTRAS llega el cuerpo, antes de tener el archivo entero en memoria.
//  fileSize → 5 MB (si se pasa, 413) · files: 1 y fields: 0 → un solo campo, `file`, y nada más (un campo extra da 400).
const FILE_LIMITS = { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 2 } as const;

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // 10 subidas por minuto y por IP; el tope por CUENTA (10 archivos) lo impone el servicio dentro de una transacción.
  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: scaled(10), ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: FILE_LIMITS }))
  create(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.uploads.create(user, file);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PageQuery) {
    return this.uploads.list(user, query.page);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.get(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.remove(user, id);
  }
}

@MinLevel(LEVEL.admin)
@Controller('admin/uploads')
export class AdminUploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: PageQuery) {
    return this.uploads.adminList(actor, query.page);
  }
}

@Module({
  controllers: [UploadsController, AdminUploadsController],
  providers: [UploadsService, UploadStorage],
})
export class UploadsModule {}
