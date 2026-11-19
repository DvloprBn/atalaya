import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator.js';
import { scaled } from '../../common/http/throttle.js';
import { setSessionCookies } from '../cookies.js';
import { type AuthUser, CurrentUser } from '../current-user.decorator.js';
import { CodeDto, PasswordAndCodeDto, PasswordDto, VerifyDto } from './dto.js';
import { SecondFactorService } from './second-factor.service.js';
import { TwoFactorService } from './two-factor.service.js';

const MIN = 60_000;

// Solo traduce HTTP ↔ servicios. Todas las rutas piden sesión (cerrado por defecto),
// salvo `verify`, que ES la que crea la sesión.
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly second: SecondFactorService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.twoFactor.status(user.id);
  }

  @Throttle({ default: { limit: scaled(5), ttl: 15 * MIN } })
  @Post('setup')
  @HttpCode(200)
  setup(@CurrentUser() user: AuthUser, @Body() dto: PasswordDto) {
    return this.twoFactor.setup(user, dto.password);
  }

  @Throttle({ default: { limit: scaled(10), ttl: 15 * MIN } })
  @Post('enable')
  @HttpCode(200)
  enable(@CurrentUser() user: AuthUser, @Body() dto: CodeDto) {
    return this.twoFactor.enable(user, dto.code);
  }

  @Throttle({ default: { limit: scaled(5), ttl: 15 * MIN } })
  @Post('disable')
  @HttpCode(200)
  async disable(@CurrentUser() user: AuthUser, @Body() dto: PasswordAndCodeDto) {
    await this.twoFactor.disable(user, dto.password, dto.code);
    return { message: 'Verificación en dos pasos desactivada. Se cerraron tus otras sesiones.' };
  }

  @Throttle({ default: { limit: scaled(5), ttl: 15 * MIN } })
  @Post('recovery-codes')
  @HttpCode(200)
  recoveryCodes(@CurrentUser() user: AuthUser, @Body() dto: PasswordAndCodeDto) {
    return this.twoFactor.regenerate(user, dto.password, dto.code);
  }

  // Segundo paso del login. Pública: todavía no hay sesión. El reto de un solo uso ES la
  // prueba de que la contraseña ya se comprobó.
  @Public()
  @Throttle({ default: { limit: scaled(10), ttl: MIN } })
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() dto: VerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.second.verifyLogin(dto.challenge, dto.code, req.ip);
    if (!result) throw new UnauthorizedException('Código incorrecto o vencido');
    setSessionCookies(res, result.tokens);
    return { user: result.user };
  }
}
