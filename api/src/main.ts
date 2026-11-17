import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap() {
  const env = loadEnv(); // sin configuración completa, el proceso no arranca

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Caddy es el único proxy delante de la API: así req.ip es la IP real del
  // visitante y los topes por IP funcionan (si no, todos compartirían la de Caddy).
  app.set('trust proxy', 1);
  app.disable('x-powered-by'); // no anunciar que esto es Express

  // Toda la API vive bajo /api, en el mismo dominio que el sitio: las cookies
  // de sesión (v0.2) no tienen que cruzar dominios y no hace falta CORS.
  app.setGlobalPrefix('api');

  // whitelist + forbidNonWhitelisted: un campo que el DTO no declara se rechaza
  // con 400 (protege contra "mass assignment", OWASP API3).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  app.enableShutdownHooks(); // cierra Postgres y Redis con orden al detenerse
  await app.listen(env.port, '0.0.0.0');
}

void bootstrap();
