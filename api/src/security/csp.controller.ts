import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/auth/public.decorator.js';
import { scaled } from '../common/http/throttle.js';
import { summarizeCspReport } from './csp-report.js';
import { SecurityLog } from './security-log.service.js';

/**
 * Recolector de reportes CSP (S-2). Público porque lo llama el navegador sin sesión, así que
 * cualquiera puede mandarle lo que quiera: por eso un JSON que no es un reporte responde 204 igual
 * (no se le dice a quien manda si valió; el 400 y el 413 son del analizador de cuerpos), topa por IP, deduplica por minuto, no guarda más que directiva y host, y el
 * cuerpo tiene el mismo tope de 16 KB que toda la API.
 */
@Controller()
export class CspController {
  constructor(private readonly security: SecurityLog) {}

  @Public()
  @Throttle({ default: { limit: scaled(30), ttl: 60_000 } })
  @Post('csp-report')
  @HttpCode(204)
  async report(@Body() body: unknown, @Req() req: Request): Promise<void> {
    const detail = summarizeCspReport(body);
    if (detail) await this.security.record('csp_violation', { ip: req.ip, detail, dedupe: true });
  }
}
