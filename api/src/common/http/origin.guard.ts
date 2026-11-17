import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { loadEnv } from '../../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defensa contra CSRF, en dos capas:
// 1. Las cookies son SameSite=Strict (cookies.ts): otro sitio no las puede usar.
// 2. Esta guarda: una petición que CAMBIA algo y viene de otro sitio se rechaza.
//    Los navegadores modernos mandan Sec-Fetch-Site; los viejos, Origin.
//    Un cliente sin navegador (curl) no manda ninguno: no es un vector de CSRF,
//    porque CSRF abusa de las cookies que el NAVEGADOR de la víctima ya tiene.
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly appOrigin = loadEnv().appOrigin;

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const site = req.headers['sec-fetch-site'];
    if (site !== undefined) {
      if (site === 'same-origin' || site === 'none') return true;
      throw new ForbiddenException('Petición de otro sitio');
    }
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== this.appOrigin) {
      throw new ForbiddenException('Petición de otro sitio');
    }
    return true;
  }
}
