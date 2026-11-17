/**
 * Por qué se rechazó un intento de login externo. Estos códigos van SOLO al log del servidor:
 * a la persona se le dice siempre lo mismo («no pudimos entrar con Google»), para no darle
 * pistas a quien esté probando cosas. Ninguno lleva datos del intento (ni tokens, ni correos).
 */
export type OAuthErrorCode =
  | 'denied' | 'bad_request' | 'state_unknown' | 'binding_mismatch'
  | 'upstream' | 'bad_token_response'
  | 'token_malformed' | 'token_alg' | 'token_kid' | 'token_key' | 'token_signature'
  | 'token_issuer' | 'token_audience' | 'token_expired' | 'token_iat' | 'token_nonce'
  | 'token_subject' | 'token_email' | 'email_unverified'
  | 'account_denied';

export class OAuthError extends Error {
  constructor(readonly code: OAuthErrorCode) {
    super(code);
  }
}
