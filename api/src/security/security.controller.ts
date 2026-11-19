import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { LEVEL, MinLevel } from '../common/auth/min-level.decorator.js';
import { SecurityReadService } from './security-read.service.js';
import { type SecurityEventType } from './security-log.service.js';

export const EVENT_TYPES = [
  'login_failed', 'login_locked', 'two_factor_failed', 'refresh_reuse', 'google_rejected', 'rate_limited', 'csp_violation',
] as const;

export class EventsQuery {
  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: SecurityEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;
}

// Igual que el resto de /admin: nivel 3 o más, o 403.
@MinLevel(LEVEL.admin)
@Controller('admin')
export class SecurityController {
  constructor(private readonly read: SecurityReadService) {}

  @Get('security/events')
  events(@CurrentUser() actor: AuthUser, @Query() q: EventsQuery) {
    return this.read.events(actor, q.type, q.page);
  }

  @Get('security/summary')
  summary() {
    return this.read.summary();
  }

  @Get('audit')
  audit(@CurrentUser() actor: AuthUser, @Query() q: PageQuery) {
    return this.read.audit(actor, q.page);
  }
}
