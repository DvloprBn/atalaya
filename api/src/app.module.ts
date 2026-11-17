import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DenyByDefaultGuard } from './common/auth/deny-by-default.guard.js';
import { HealthModule } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { RedisModule } from './redis/redis.service.js';

@Module({
  imports: [
    // Tope general: 60 peticiones por minuto, por IP y por ruta. Las rutas
    // sensibles (login, correo) llevan su propio tope más bajo desde v0.2.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
  ],
  providers: [
    // Las guardas globales corren en este orden: primero el tope, luego el acceso.
    // Así un atacante agota su tope antes de poder probar credenciales.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: DenyByDefaultGuard },
  ],
})
export class AppModule {}
