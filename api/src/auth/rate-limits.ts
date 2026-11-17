import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { sha256 } from './tokens.js';

// Topes que el límite por IP no cubre (lección 63, regla 1: "todo freno por IP
// necesita su hermano por cuenta"). Un atacante con mil IPs prueba contraseñas
// contra UNA cuenta; el tope por cuenta lo detiene igual.
//
// Las llaves usan el SHA-256 del correo: Redis no guarda correos en claro.

const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_S = 15 * 60;
const MAIL_COOLDOWN_S = 60; // un correo por destinatario por minuto
const MAIL_GLOBAL_PER_HOUR = 200; // tope global: protege la reputación del servidor de correo

export type MailPurpose = 'register' | 'password_reset' | 'invite';

@Injectable()
export class RateLimits {
  constructor(private readonly redis: RedisService) {}

  async isLoginLocked(email: string): Promise<boolean> {
    const failures = Number(await this.redis.client.get(this.loginKey(email)));
    return failures >= LOGIN_MAX_FAILURES;
  }

  async recordLoginFailure(email: string): Promise<void> {
    const key = this.loginKey(email);
    // MULTI: el contador y su vigencia se escriben juntos (nunca un contador eterno).
    await this.redis.client.multi().incr(key).expire(key, LOGIN_WINDOW_S, 'NX').exec();
  }

  async clearLoginFailures(email: string): Promise<void> {
    await this.redis.client.del(this.loginKey(email));
  }

  /**
   * ¿Se puede mandar un correo de este tipo a esta dirección ahora? Tope por
   * destinatario Y propósito (un correo de verificación no bloquea el de
   * restablecer), con SET NX: atómico, sin "leer y comparar". Más un tope global por hora.
   */
  async allowMailTo(email: string, purpose: MailPurpose): Promise<boolean> {
    const key = `atalaya:mail-to:${purpose}:${sha256(email)}`;
    const fresh = await this.redis.client.set(key, '1', 'EX', MAIL_COOLDOWN_S, 'NX');
    if (fresh !== 'OK') return false;
    const hourKey = `atalaya:mail-hour:${new Date().toISOString().slice(0, 13)}`;
    const [[, sent]] = (await this.redis.client.multi().incr(hourKey).expire(hourKey, 3600, 'NX').exec()) as [
      [Error | null, number],
    ];
    return sent <= MAIL_GLOBAL_PER_HOUR;
  }

  private loginKey(email: string): string {
    return `atalaya:login-fail:${sha256(email)}`;
  }
}
