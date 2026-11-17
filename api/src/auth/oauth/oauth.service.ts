import { Injectable } from '@nestjs/common';
import { loadEnv, type OAuthConfig } from '../../config/env.js';
import type { SessionCookies } from '../cookies.js';
import { SecondFactorService } from '../two-factor/second-factor.service.js';
import { SessionsService } from '../sessions.service.js';
import { OAuthAccounts } from './google-accounts.js';
import { postForm } from './http-json.js';
import { verifyIdToken, type IdTokenClaims } from './id-token.js';
import { JwksCache } from './jwks.js';
import { OAuthError } from './oauth-error.js';
import { challengeFor } from './pkce.js';
import { OAuthStates } from './state-store.js';

export type CallbackResult = { kind: 'session'; tokens: SessionCookies } | { kind: 'challenge'; challenge: string };

/** El baile completo de Authorization Code + PKCE contra un proveedor OpenID Connect (Google). */
@Injectable()
export class OAuthService {
  private readonly config = loadEnv().oauth;
  private readonly redirectUri = `${loadEnv().appOrigin}/api/auth/google/callback`;

  constructor(
    private readonly states: OAuthStates,
    private readonly jwks: JwksCache,
    private readonly accounts: OAuthAccounts,
    private readonly sessions: SessionsService,
    private readonly second: SecondFactorService,
  ) {}

  get enabled(): boolean {
    return this.config !== null;
  }

  /** Paso 1: lo que se le manda al navegador. Devuelve la URL de Google y la cookie que ata el intento a ese navegador. */
  async start(): Promise<{ url: string; binding: string }> {
    const config = this.need();
    const attempt = await this.states.create();
    const url = new URL(config.authUrl);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: this.redirectUri,
      scope: 'openid email',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: challengeFor(attempt.verifier),
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), binding: attempt.binding };
  }

  /** Paso 2: Google regresó al navegador con `code` y `state`. Cualquier fallo lanza un OAuthError con su código. */
  async callback(query: { code?: unknown; state?: unknown; error?: unknown }, binding: unknown): Promise<CallbackResult> {
    if (typeof query.error === 'string') throw new OAuthError('denied'); // la persona dijo que no en Google
    const { code, state } = query;
    if (typeof code !== 'string' || typeof state !== 'string' || code.length === 0 || code.length > 2048) {
      throw new OAuthError('bad_request');
    }
    // 1) ¿Es un intento NUESTRO, vigente, de ESTE navegador? (state + cookie)
    const { nonce, verifier } = await this.states.consume(state, binding);
    // 2) Canjear el código por el id_token (el servidor habla con Google; el verifier prueba que somos quien empezó).
    const idToken = await this.exchange(code, verifier);
    // 3) Comprobar firma, emisor, audiencia, vigencia, nonce y correo verificado.
    const claims = await this.verify(idToken, nonce);
    // 4) ¿De qué cuenta de Atalaya es?
    const { userId } = await this.accounts.resolve(claims);
    // 5) Con 2FA activo, Google NO lo salta: pasa por el segundo paso igual que con contraseña.
    if (await this.second.isEnabled(userId)) {
      return { kind: 'challenge', challenge: await this.second.startChallenge(userId) };
    }
    return { kind: 'session', tokens: await this.sessions.start(userId) };
  }

  private async exchange(code: string, verifier: string): Promise<string> {
    const config = this.need();
    const body = await postForm(config.tokenUrl, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    });
    const idToken = (body as { id_token?: unknown } | null)?.id_token;
    if (typeof idToken !== 'string') throw new OAuthError('bad_token_response');
    return idToken;
  }

  private async verify(idToken: string, nonce: string): Promise<IdTokenClaims> {
    const config = this.need();
    const expected = { issuers: config.issuers, audience: config.clientId, nonce };
    try {
      return verifyIdToken(idToken, await this.jwks.get(), expected);
    } catch (error) {
      // Llave desconocida o firma que no verifica: el proveedor pudo rotar sus llaves. Se vuelve a pedir el conjunto UNA vez.
      if (error instanceof OAuthError && (error.code === 'token_kid' || error.code === 'token_signature')) {
        return verifyIdToken(idToken, await this.jwks.refresh(), expected);
      }
      throw error;
    }
  }

  private need(): OAuthConfig {
    if (!this.config) throw new OAuthError('bad_request');
    return this.config;
  }
}
