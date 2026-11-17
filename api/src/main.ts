import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { NoNullBytesPipe } from './common/http/no-null-bytes.pipe.js';
import { loadEnv } from './config/env.js';

async function bootstrap() {
  const env = loadEnv(); // sin configuración completa, el proceso no arranca

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Caddy es el único proxy delante de la API: así req.ip es la IP real del
  // visitante y los topes por IP funcionan (si no, todos compartirían la de Caddy).
  app.set('trust proxy', 1);
  app.disable('x-powered-by'); // no anunciar que esto es Express

  // Cuerpos JSON de máximo 16 KB: ningún formulario de acceso necesita más,
  // y un cuerpo gigante no puede ocupar memoria antes de validarse.
  app.useBodyParser('json', { limit: '16kb' });
  app.use(cookieParser());

  // Toda la API vive bajo /api, en el mismo dominio que el sitio: las cookies
  // de sesión no tienen que cruzar dominios y no hace falta CORS.
  app.setGlobalPrefix('api');

  // 1. NoNullBytesPipe: el byte nulo se rechaza antes que nada (lección 248).
  // 2. ValidationPipe con whitelist + forbidNonWhitelisted: un campo que el DTO no
  //    declara se rechaza con 400 (protege contra "mass assignment", OWASP API3).
  app.useGlobalPipes(
    new NoNullBytesPipe(),
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.enableShutdownHooks(); // cierra Postgres y Redis con orden al detenerse
  await app.listen(env.port, '0.0.0.0');
}

void bootstrap();
