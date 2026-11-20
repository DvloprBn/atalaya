import { Controller, Get, Logger, NotFoundException, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator.js';
import { scaled } from '../../common/http/throttle.js';
import { SecurityLog } from '../../security/security-log.service.js';
import { setSessionCookies } from '../cookies.js';
import { OAuthError } from './oauth-error.js';
import { OAuthService } from './oauth.service.js';

// La cookie que ata el intento de login al navegador que lo empezó. `__Host-` obliga a Secure,
// Path=/ y sin Domain. SameSite=LAX y no Strict: el regreso desde Google es una navegación
// ENTRE SITIOS y el navegador no manda cookies Strict en ella; Lax sí las manda en un GET de
// primer nivel (y solo ahí), que es justo lo que se necesita.
const BINDING_COOKIE = '__Host-atalaya_oauth';
const BINDING_OPTIONS: CookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
const MIN = 60_000;

// Destinos FIJOS: la respuesta nunca redirige a nada que venga de la petición (sin "open redirect").
const OK = '/cuenta';
const FAILED = '/login?error=google';
/** v1.0 · Demo llena: no es un rechazo ni un ataque, y no dice nada de la cuenta; se avisa tal cual. */
const DEMO_FULL = '/login?error=demo_llena';

@Controller('auth')
export class OAuthController {
  private readonly log = new Logger('OAuth');

  constructor(
    private readonly oauth: OAuthService,
    private readonly security: SecurityLog,
  ) {}

  @Public()
  @Get('providers')
  providers() {
    return { google: this.oauth.enabled };
  }

  @Public()
  @Throttle({ default: { limit: scaled(10), ttl: MIN } })
  @Get('google/start')
  async start(@Res() res: Response) {
    if (!this.oauth.enabled) throw new NotFoundException();
    const { url, binding } = await this.oauth.start();
    res.cookie(BINDING_COOKIE, binding, { ...BINDING_OPTIONS, maxAge: 10 * MIN });
    res.redirect(302, url);
  }

  // `@Query()` sin clase: Google agrega parámetros propios (scope, authuser, prompt, iss…) y el
  // ValidationPipe global los rechazaría. Aquí solo se leen `code`, `state` y `error`, con sus topes.
  @Public()
  @Throttle({ default: { limit: scaled(20), ttl: MIN } })
  @Get('google/callback')
  async callback(@Query() query: Record<string, unknown>, @Req() req: Request, @Res() res: Response) {
    const binding: unknown = req.cookies?.[BINDING_COOKIE];
    res.clearCookie(BINDING_COOKIE, BINDING_OPTIONS); // el intento se gasta pase lo que pase
    try {
      const result = await this.oauth.callback(query, binding);
      if (result.kind === 'challenge') {
        // En el fragmento (#): no viaja al servidor, ni en `Referer`, ni queda en los registros de acceso.
        return res.redirect(302, `/login#challenge=${result.challenge}`);
      }
      setSessionCookies(res, result.tokens);
      return res.redirect(302, OK);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) return res.redirect(302, DEMO_FULL);
      // Al log, el CÓDIGO del rechazo (nunca tokens ni correos). A la persona, siempre lo mismo.
      const code = error instanceof OAuthError ? error.code : 'error_inesperado';
      this.log.warn(`login con Google rechazado: ${code}`);
      await this.security.record('google_rejected', { ip: req.ip, detail: code }); // S-14
      return res.redirect(302, FAILED);
    }
  }
}
