import {
  Body, Controller, Delete, Get, Header, HttpCode, Module, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Query, StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { scaled } from '../common/http/throttle.js';
import { PageQuery } from '../uploads/dto.js';
import { AnalysesService } from './analyses.service.js';
import { CreateAnalysisDto, MappingDto } from './dto.js';
import { RESULT_KINDS, type ResultKind, ResultsStorage } from './results-storage.js';

// Todas las rutas piden sesión (cerrado por defecto) y todo es de su dueño: lo ajeno responde 404.
@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: scaled(10), ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnalysisDto) {
    return this.analyses.create(user, dto.uploadId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PageQuery) {
    return this.analyses.list(user, query.page);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.analyses.get(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.analyses.remove(user, id);
  }

  @Put(':id/mapping')
  @HttpCode(202)
  @Throttle({ default: { limit: scaled(20), ttl: 60_000 } })
  putMapping(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MappingDto) {
    return this.analyses.putMapping(user, id, dto);
  }

  // Se entrega como ADJUNTO y con `nosniff`: el navegador lo descarga, no lo interpreta. El nombre lo genera el
  // servidor (nunca sale de lo que escribió la persona). El BOM y el anti-fórmulas ya los puso el worker al escribirlo.
  @Get(':id/export/:kind')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async exportFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', new ParseEnumPipe(RESULT_KINDS)) kind: ResultKind,
  ) {
    const file = await this.analyses.exportFile(user, id, kind);
    return new StreamableFile(file.stream, {
      length: file.size,
      disposition: `attachment; filename="atalaya-${id.slice(0, 8)}-${kind}.csv"`,
    });
  }
}

@Module({
  controllers: [AnalysesController],
  providers: [AnalysesService, ResultsStorage],
  exports: [ResultsStorage],
})
export class AnalysesModule {}
