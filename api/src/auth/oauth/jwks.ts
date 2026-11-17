import { Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env.js';
import { getJson } from './http-json.js';
import type { Jwk } from './id-token.js';
import { OAuthError } from './oauth-error.js';

const TTL_MS = 10 * 60_000; // las llaves del proveedor cambian rara vez
const REFRESH_MIN_MS = 30_000; // y un token con una llave desconocida no puede forzar una descarga por petición
const MAX_KEYS = 20;

/** Las llaves públicas del proveedor (JWKS), en memoria. Con ellas se verifica la firma de cada id_token. */
@Injectable()
export class JwksCache {
  private keys: Jwk[] = [];
  private fetchedAt = 0;

  async get(): Promise<Jwk[]> {
    if (this.keys.length === 0 || Date.now() - this.fetchedAt > TTL_MS) await this.load();
    return this.keys;
  }

  /** Para cuando un token trae un `kid` nuevo o no verifica: el proveedor pudo rotar llaves. Máximo una vez cada 30 s. */
  async refresh(): Promise<Jwk[]> {
    if (Date.now() - this.fetchedAt > REFRESH_MIN_MS) await this.load();
    return this.keys;
  }

  private async load(): Promise<void> {
    const config = loadEnv().oauth;
    if (!config) throw new OAuthError('upstream');
    const doc = await getJson(config.jwksUrl);
    const keys = (doc as { keys?: unknown } | null)?.keys;
    if (!Array.isArray(keys)) throw new OAuthError('bad_token_response');
    this.keys = keys.filter((k): k is Jwk => typeof k === 'object' && k !== null).slice(0, MAX_KEYS);
    this.fetchedAt = Date.now();
  }
}
