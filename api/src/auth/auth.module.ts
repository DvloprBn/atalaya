import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { InvitationsService } from './invitations.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { RateLimits } from './rate-limits.js';
import { RegistrationService } from './registration.service.js';
import { SessionsService } from './sessions.service.js';
import { OAuthAccounts } from './oauth/google-accounts.js';
import { JwksCache } from './oauth/jwks.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { OAuthService } from './oauth/oauth.service.js';
import { OAuthStates } from './oauth/state-store.js';
import { Challenges } from './two-factor/challenges.js';
import { SecondFactorService } from './two-factor/second-factor.service.js';
import { KeyRingCheck } from './two-factor/key-ring-check.js';
import { SecretBox } from './two-factor/secret-box.js';
import { TwoFactorResets } from './two-factor/two-factor-resets.js';
import { TwoFactorController } from './two-factor/two-factor.controller.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';

const JWT = { issuer: 'atalaya-api', audience: 'atalaya-web' };

@Module({
  imports: [
    JwtModule.register({
      secret: loadEnv().jwtSecret,
      // Se FIJA el algoritmo al firmar y al verificar: un token con "alg: none"
      // o con otro algoritmo se rechaza (ataque clásico de confusión de algoritmo).
      signOptions: { algorithm: 'HS256', ...JWT },
      verifyOptions: { algorithms: ['HS256'], ...JWT },
    }),
  ],
  controllers: [AuthController, TwoFactorController, OAuthController],
  providers: [
    AuthService, RegistrationService, PasswordResetService, InvitationsService, SessionsService, RateLimits, AuthGuard,
    // Segundo factor. La llave de cifrado sale del entorno (nunca de la base) y se valida al arrancar.
    {
      provide: SecretBox,
      // S-9: la llave actual cifra; las anteriores (si hay una rotación en curso) solo descifran.
      useFactory: () => {
        const env = loadEnv();
        return new SecretBox(Buffer.from(env.totpEncryptionKey, 'hex'), env.totpEncryptionKeysOld.map((k) => Buffer.from(k, 'hex')));
      },
    },
    Challenges, SecondFactorService, TwoFactorService,
    TwoFactorResets, // S-10: recuperación asistida (crear, cancelar, aplicar a las 48 h)
    KeyRingCheck, // S-9: al arrancar avisa si el llavero no abre lo que hay en la base
    // Login con Google (OpenID Connect).
    OAuthService, OAuthStates, JwksCache, OAuthAccounts,
  ],
  exports: [AuthGuard, JwtModule, InvitationsService, SessionsService, TwoFactorService, TwoFactorResets],
})
export class AuthModule {}
