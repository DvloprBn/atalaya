import { Controller, Get, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/auth/public.decorator.js';
import { HealthReport, HealthService } from './health.service.js';

// GET /api/health — ¿están vivas la base, Redis y el worker?
// Público a propósito: lo usan Docker y el monitoreo, y no revela nada sensible.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async get(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check();
    // 503 = "no estoy listo": así un balanceador o Docker lo detecta sin leer el cuerpo.
    if (report.status !== 'ok') res.status(503);
    return report;
  }
}

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
