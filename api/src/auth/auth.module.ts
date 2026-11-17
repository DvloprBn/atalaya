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
import { Challenges } from './two-factor/challenges.js';
import { SecondFactorService } from './two-factor/second-factor.service.js';
import { SecretBox } from './two-factor/secret-box.js';
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
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService, RegistrationService, PasswordResetService, InvitationsService, SessionsService, RateLimits, AuthGuard,
    // Segundo factor. La llave de cifrado sale del entorno (nunca de la base) y se valida al arrancar.
    { provide: SecretBox, useFactory: () => new SecretBox(Buffer.from(loadEnv().totpEncryptionKey, 'hex')) },
    Challenges, SecondFactorService, TwoFactorService,
  ],
  exports: [AuthGuard, JwtModule, InvitationsService, SessionsService],
})
export class AuthModule {}
