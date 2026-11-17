import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';
import { newOpaqueToken, sha256 } from '../tokens.js';

const TTL_S = 5 * 60; // la persona tiene 5 minutos para escribir su código
export const MAX_TRIES = 5; // y 5 equivocaciones; luego hay que volver a poner la contraseña

// EL "TOKEN PUENTE" entre la contraseña y el código. Dice "esta contraseña ya se comprobó,
// falta el segundo factor". NO es una sesión: solo se canjea en /auth/2fa/verify.
//   - De un solo uso: `consume` es un GETDEL atómico, solo UNA petición lo gana.
//   - Vive en Redis y solo con su hash: ni Redis guarda un token usable.
//   - Con tope de intentos propio, aparte del tope por cuenta.
@Injectable()
export class Challenges {
  constructor(private readonly redis: RedisService) {}

  async create(userId: string): Promise<string> {
    const token = newOpaqueToken();
    await this.redis.client.set(this.key(token), userId, 'EX', TTL_S);
    return token;
  }

  /** ¿De quién es este reto? null si no existe, venció o ya se usó. No lo gasta. */
  peek(token: string): Promise<string | null> {
    return this.redis.client.get(this.key(token));
  }

  /** Suma un fallo; al llegar al tope, el reto se destruye. */
  async recordFailure(token: string): Promise<void> {
    const tries = this.key(token, 'tries');
    const [[, count]] = (await this.redis.client.multi().incr(tries).expire(tries, TTL_S, 'NX').exec()) as [
      [Error | null, number],
    ];
    if (count >= MAX_TRIES) await this.redis.client.del(this.key(token));
  }

  /** Gasta el reto. true solo para la petición que lo gana. */
  async consume(token: string): Promise<boolean> {
    return (await this.redis.client.getdel(this.key(token))) !== null;
  }

  private key(token: string, kind: 'tries' | 'id' = 'id'): string {
    return `atalaya:mfa:${kind}:${sha256(token)}`;
  }
}
