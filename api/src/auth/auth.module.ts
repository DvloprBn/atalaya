import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { RateLimits } from './rate-limits.js';
import { RegistrationService } from './registration.service.js';
import { SessionsService } from './sessions.service.js';

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
  controllers: [AuthController],
  providers: [AuthService, RegistrationService, PasswordResetService, SessionsService, RateLimits, AuthGuard],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
