import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';
import { newOpaqueToken, OPAQUE_TOKEN_PATTERN, sha256 } from '../tokens.js';
import { OAuthError } from './oauth-error.js';
import { newVerifier } from './pkce.js';

const TTL_S = 10 * 60;

/**
 * El estado de UN intento de login con Google, en Redis (10 minutos, de un solo uso):
 *   state    → viaja por la URL y vuelve idéntico; es la llave de este registro.
 *   nonce    → se le da a Google y debe volver DENTRO del id_token firmado.
 *   verifier → el secreto de PKCE; no sale de aquí hasta el canje del código.
 *   binding  → ata el intento al NAVEGADOR que lo empezó (va en una cookie httpOnly; aquí solo su hash).
 *
 * El `binding` es la defensa contra el "login CSRF": sin él, un atacante empieza un intento, y
 * le manda a la víctima el enlace de regreso para que su navegador lo termine y quede dentro de
 * la cuenta del atacante. La víctima no tiene la cookie, y el intento se rechaza.
 */
@Injectable()
export class OAuthStates {
  constructor(private readonly redis: RedisService) {}

  async create() {
    const attempt = { state: newOpaqueToken(), nonce: newOpaqueToken(), verifier: newVerifier(), binding: newOpaqueToken() };
    const record = JSON.stringify({ nonce: attempt.nonce, verifier: attempt.verifier, binding: sha256(attempt.binding) });
    await this.redis.client.set(this.key(attempt.state), record, 'EX', TTL_S);
    return attempt;
  }

  /** Gasta el intento (GETDEL: una sola vez, aunque la cookie no coincida) y comprueba el navegador. */
  async consume(state: string, binding: unknown): Promise<{ nonce: string; verifier: string }> {
    if (!OPAQUE_TOKEN_PATTERN.test(state)) throw new OAuthError('bad_request');
    const raw = await this.redis.client.getdel(this.key(state));
    if (!raw) throw new OAuthError('state_unknown');

    const record = JSON.parse(raw) as { nonce: string; verifier: string; binding: string };
    const stored = Buffer.from(record.binding, 'hex');
    const given = typeof binding === 'string' && OPAQUE_TOKEN_PATTERN.test(binding) ? Buffer.from(sha256(binding), 'hex') : null;
    if (!given || given.length !== stored.length || !timingSafeEqual(given, stored)) throw new OAuthError('binding_mismatch');
    return { nonce: record.nonce, verifier: record.verifier };
  }

  private key(state: string): string {
    return `atalaya:oauth:${sha256(state)}`; // Redis solo guarda el hash del state
  }
}
