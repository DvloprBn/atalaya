import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/auth/public.decorator.js';
import { scaled } from '../common/http/throttle.js';
import { AuthService, type PublicUser } from './auth.service.js';
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from './cookies.js';
import { type AuthUser, CurrentUser } from './current-user.decorator.js';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto.js';
import { InvitationsService } from './invitations.service.js';
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
    private readonly invitations: InvitationsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: scaled(5), ttl: 15 * MIN } })
  @Post('register')
  @HttpCode(202)
  async register(@Body() dto: RegisterDto) {
    await this.registration.register(dto.email, dto.password);
    return CHECK_YOUR_EMAIL;
  }

  @Public()
  @Throttle({ default: { limit: scaled(10), ttl: MIN } })
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto) {
    if (!(await this.registration.verify(dto.token))) throw new BadRequestException(INVALID_LINK);
    return { message: 'Correo confirmado. Ya puedes iniciar sesión.' };
  }

  // 20 por minuto por IP: varias personas pueden compartir una IP (una oficina, la red
  // del celular). La defensa fuerte contra adivinar contraseñas es el tope POR CUENTA
  // (10 fallos en 15 min, rate-limits.ts), que no depende de la IP.
  @Public()
  @Throttle({ default: { limit: scaled(20), ttl: MIN } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, req.ip);
    if (!result) throw new UnauthorizedException('Correo o contraseña incorrectos');
    if ('challenge' in result) return { twoFactorRequired: true, challenge: result.challenge }; // sin cookies
    setSessionCookies(res, result.tokens);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: scaled(30), ttl: MIN } })
  @Post('refresh')
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refresh: unknown = req.cookies?.[REFRESH_COOKIE];
    const tokens = typeof refresh === 'string' ? await this.sessions.rotate(refresh, req.ip) : null;
    if (!tokens) {
      clearSessionCookies(res);
      throw new UnauthorizedException();
    }
    setSessionCookies(res, tokens);
  }

  // Público a propósito: cerrar sesión debe funcionar aunque el acceso ya haya vencido.
  @Public()
  @Throttle({ default: { limit: scaled(30), ttl: MIN } })
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
  @Throttle({ default: { limit: scaled(3), ttl: 15 * MIN } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: EmailDto) {
    await this.passwordReset.request(dto.email);
    return CHECK_YOUR_EMAIL;
  }

  @Public()
  @Throttle({ default: { limit: scaled(5), ttl: 15 * MIN } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    if (!(await this.passwordReset.reset(dto.token, dto.password))) throw new BadRequestException(INVALID_LINK);
    return { message: 'Contraseña actualizada. Se cerraron todas tus sesiones; vuelve a entrar.' };
  }

  @Public()
  @Throttle({ default: { limit: scaled(5), ttl: 15 * MIN } })
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(@Body() dto: ResetPasswordDto) {
    const result = await this.invitations.accept(dto.token, dto.password);
    if (!result) throw new BadRequestException(INVALID_LINK);
    return { message: 'Cuenta activada. Ya puedes iniciar sesión.' };
  }
}
