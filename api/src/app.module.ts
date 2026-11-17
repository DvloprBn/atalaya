import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { OriginGuard } from './common/http/origin.guard.js';
import { HealthModule } from './health/health.controller.js';
import { MailModule } from './mail/mail.service.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { RedisModule } from './redis/redis.service.js';

@Module({
  imports: [
    // Tope general: 60 peticiones por minuto, por IP y por ruta. Las rutas
    // sensibles (registro, login, correo) llevan su propio @Throttle más bajo.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // Las guardas globales corren en ESTE orden:
    // 1. tope (un atacante agota su cupo antes de poder probar nada),
    // 2. origen (una petición de otro sitio no llega ni a leer la sesión),
    // 3. sesión (cerrado por defecto: sin @Public() hace falta sesión válida).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
