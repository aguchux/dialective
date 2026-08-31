import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

const API_PREFIX = 'api/v1';

/**
 * Mirrors main.ts's bootstrap (prefix, global ValidationPipe, exception
 * filter) so e2e tests exercise the same request pipeline production does.
 * Omits helmet()/CORS -- irrelevant to authorization behavior under test.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  return app;
}

export function apiPath(path: string): string {
  return `/${API_PREFIX}/${path.replace(/^\//, '')}`;
}

/**
 * app.close() tears down every module, including RedisStreamsService's
 * onModuleDestroy (`await this.redis.quit()`), which throws when no local
 * Redis is reachable and ioredis has already exhausted its retry budget.
 * That's an environmental gap unrelated to what these suites test -- a
 * failed Redis teardown must not fail an authorization test run.
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  try {
    await app.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `app.close() threw during teardown (expected without a local Redis): ${err instanceof Error ? err.message : err}`,
    );
  }
}
