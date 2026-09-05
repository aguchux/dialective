import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

const DEFAULT_LIMIT_PER_MINUTE = Number(process.env.STREAM_KEY_DEFAULT_RATE_LIMIT_PER_MINUTE ?? 60);
const WINDOW_SECONDS = 60;

/**
 * Per-Stream-Key rate limit (doc section 35 step 10 / section 36 "rate-limit
 * events"), sourced from the key's organization's SubscriptionPlan.rateLimitPerMinute
 * -- a per-plan cap (same nullable-Int-on-SubscriptionPlan shape as
 * maxStreamDecks), not a PlatformSettingsService global dial, since this
 * value legitimately varies per subscription tier. null means unlimited for
 * that plan, falling through to DEFAULT_LIMIT_PER_MINUTE as a hard ceiling
 * for any key regardless of plan.
 *
 * Redis-backed fixed-window counter (INCR + EXPIRE on a per-key-per-minute
 * bucket), not @nestjs/throttler's default in-memory ThrottlerStorage --
 * an in-process counter is trivially defeated by horizontal scaling (each
 * pod enforces its own independent quota, so the effective limit multiplies
 * by pod count). Fails OPEN on Redis error, matching this guard chain's
 * existing best-effort-infra posture (DedicatedCapacityGuard,
 * UsageCounterService) -- Redis being down must not take down streaming.
 */
@Injectable()
export class StreamKeyRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(StreamKeyRateLimitGuard.name);
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST ?? 'redis',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const tracker = request.streamKey?.id ?? request.ip;

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.streamKey.organizationId },
      include: { plan: true },
    });
    const limit = subscription?.plan.rateLimitPerMinute ?? DEFAULT_LIMIT_PER_MINUTE;

    try {
      const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
      const key = `stream-key-rate-limit:${tracker}:${bucket}`;
      const count = await this.redis.incr(key);
      if (count === 1) {
        // Only the request that creates the bucket needs to set its TTL --
        // extra headroom past the window so a slow EXPIRE never lets a
        // bucket outlive its window and leak into the next one uncapped.
        await this.redis.expire(key, WINDOW_SECONDS + 5);
      }
      if (count > limit) {
        throw new HttpException(
          `Rate limit of ${limit} requests/minute exceeded for this Stream Key`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `StreamKeyRateLimitGuard: failing open due to Redis error: ${err instanceof Error ? err.message : err}`,
      );
      return true; // fail open -- never let this mechanism become a new SPOF
    }
  }
}
