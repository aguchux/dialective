import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const API_PREFIX = 'api/v1';
const COINBASE_WEBHOOK_PATH = `/${API_PREFIX}/wallet/webhooks/coinbase`;

function parseAllowedOrigins(): string[] {
  // Default matches the Vercel-hosted frontend's custom domain (see
  // /frontend, deployed separately from this repo's k8s manifests).
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? 'https://app.nmseprep.com';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // Coinbase Commerce's webhook signature is an HMAC over the exact raw
  // request bytes -- Nest's default body parser JSON-decodes before any
  // handler sees it, so this route needs its own raw-body-preserving
  // middleware ahead of that. `app.use(path, ...)` on Nest's Express adapter
  // does NOT scope by path the way plain Express does -- it still runs (and
  // drains the body stream) for every request, which broke every other
  // POST route's body parsing. Checking req.path inside a single global
  // middleware scopes it correctly instead. See
  // CoinbaseCommerceService.verifyWebhookSignature.
  const coinbaseWebhookBodyParser = json({
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === COINBASE_WEBHOOK_PATH) {
      coinbaseWebhookBodyParser(req, res, next);
    } else {
      next();
    }
  });

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
