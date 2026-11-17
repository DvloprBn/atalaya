import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/public.decorator.js';
import { AuthService, type PublicUser } from './auth.service.js';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './cookies.js';
import { type AuthUser, CurrentUser } from './current-user.decorator.js';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto.js';
import { PasswordResetService } from './password-reset.service.js';
import { RegistrationService } from './registration.service.js';
import { SessionsService } from './sessions.service.js';

// El controlador solo traduce HTTP ↔ servicios: lee el cuerpo y las cookies,
// llama al servicio y arma la respuesta. Ninguna regla de negocio vive aquí.

const MIN = 60_000;
/** Mismo mensaje exista o no la cuenta: la pantalla nunca revela quién está registrado. */
const CHECK_YOUR_EMAIL = { message: 'Si el correo es válido, te enviamos un mensaje con los siguientes pasos.' };
const INVALID_LINK = 'El enlace no es válido o ya venció. Pide uno nuevo.';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MIN } })
  @Post('register')
  @HttpCode(202)
  async register(@Body() dto: RegisterDto) {
    await this.registration.register(dto.email, dto.password);
    return CHECK_YOUR_EMAIL;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: MIN } })
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto) {
    if (!(await this.registration.verify(dto.token))) throw new BadRequestException(INVALID_LINK);
    return { message: 'Correo confirmado. Ya puedes iniciar sesión.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: MIN } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<{ user: PublicUser }> {
    const result = await this.auth.login(dto.email, dto.password);
    if (!result) throw new UnauthorizedException('Correo o contraseña incorrectos');
    setSessionCookies(res, result.tokens);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: MIN } })
  @Post('refresh')
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refresh: unknown = req.cookies?.[REFRESH_COOKIE];
    const tokens = typeof refresh === 'string' ? await this.sessions.rotate(refresh) : null;
    if (!tokens) {
      clearSessionCookies(res);
      throw new UnauthorizedException();
    }
    setSessionCookies(res, tokens);
  }

  // Público a propósito: cerrar sesión debe funcionar aunque el acceso ya haya vencido.
  @Public()
  @Throttle({ default: { limit: 30, ttl: MIN } })
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refresh: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof refresh === 'string') await this.sessions.revokeByRefresh(refresh, 'logout');
    clearSessionCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): PublicUser {
    return { id: user.id, email: user.email, role: user.role };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 15 * MIN } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: EmailDto) {
    await this.passwordReset.request(dto.email);
    return CHECK_YOUR_EMAIL;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 15 * MIN } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    if (!(await this.passwordReset.reset(dto.token, dto.password))) throw new BadRequestException(INVALID_LINK);
    return { message: 'Contraseña actualizada. Se cerraron todas tus sesiones; vuelve a entrar.' };
  }
}
