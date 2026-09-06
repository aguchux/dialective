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
  // (see chatdialect/docs/CHATDIALECT_MVP_PLAN.md), deployed to
  // labs.dialectlibrary.com, that also calls this api
  // (ChatDialectController) -- its domain lives in the
  // CORS_ALLOWED_ORIGINS env var in k8s/overlays/prod/configs/api.env,
  // not hardcoded here.
  const raw =
    process.env.CORS_ALLOWED_ORIGINS ?? 'https://dialectlibrary.com,https://www.dialectlibrary.com';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  // rawBody: true populates req.rawBody (a Buffer) alongside the normal
  // parsed req.body on every request -- needed by the Flutterwave webhook
  // handler, whose HMAC-SHA256 signature is documented as being computed
  // over the raw request bytes, not a re-serialization of the parsed JSON
  // (unlike NOWPayments' IPN signature, which verifies against sorted
  // parsed JSON and needs no raw body at all). Harmless for every other
  // route -- they just never read req.rawBody.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Express's default HTTP adapter auto-generates a weak ETag for every
  // JSON response. A client that sends back If-None-Match on a later
  // request then gets a bare 304 with no body -- fine when the client's
  // cached body is known-fresh, but RTK Query's fetchBaseQuery uses the
  // browser's default fetch cache mode, so a response cached before some
  // data existed (or under a narrower filter) can keep being silently
  // revalidated as "unchanged" indefinitely, reusing a stale/empty body
  // no hard refresh reliably clears. Every response here is either
  // personalized, permission-gated, or time-sensitive enough that this
  // kind of conditional caching does more harm than it saves.
  app.getHttpAdapter().getInstance().set('etag', false);

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
