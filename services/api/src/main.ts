import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const API_PREFIX = 'api/v1';

function parseAllowedOrigins(): string[] {
  // Default matches the Vercel-hosted frontend's custom domain (see
  // /frontend, deployed separately from this repo's k8s manifests).
  // chatdialect/apps/web is a second, separate Vercel-hosted Next.js app
  // (see chatdialect/docs/CHATDIALECT_MVP_PLAN.md) that also calls this
  // api (ChatDialectController) -- once it has a real domain, add it to
  // the CORS_ALLOWED_ORIGINS env var in k8s/overlays/prod/configs/api.env,
  // not here (never hardcode a second domain into this default).
  const raw =
    process.env.CORS_ALLOWED_ORIGINS ?? 'https://dialectlibrary.com,https://www.dialectlibrary.com';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: parseAllowedOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.setGlobalPrefix(API_PREFIX, {
    // /health stays unprefixed so k8s readiness/liveness probes and
    // uptime checks don't need to know about API versioning.
    exclude: ['health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
