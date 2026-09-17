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
import { buildRedisConnectionOptions } from '../../common/redis-connection.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

const FLEET_MAX_CONCURRENT_STREAMS = Number(process.env.FLEET_MAX_CONCURRENT_STREAMS ?? 0);
const FLEET_MAX_REQUESTS_PER_MINUTE = Number(process.env.FLEET_MAX_REQUESTS_PER_MINUTE ?? 0);

/**
 * Doc section 61 "dedicated capacity" -- a guaranteed throughput FLOOR for
 * Enterprise orgs, not physical isolation (same shared api pod fleet, no new
 * k8s infra). Sits BEFORE QuotaGuard/ConcurrentStreamGuard/
 * StreamKeyRateLimitGuard and adds a fleet-wide priority check on top of
 * their existing per-org ceilings -- never replaces per-org enforcement.
 * Redis-backed (cross-pod-accurate, unlike those two guards' documented
 * per-pod gap) so the floor guarantee is real; fails OPEN on Redis error,
 * matching this guard chain's existing best-effort-infra posture
 * (StreamAccessLogService, UsageCounterService). No-op whenever
 * FLEET_MAX_CONCURRENT_STREAMS/FLEET_MAX_REQUESTS_PER_MINUTE are unset (0)
 * or no Enterprise org is currently consuming its reserved floor for EITHER
 * resource -- see isReservedFloorAtRisk().
 */
@Injectable()
export class DedicatedCapacityGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(DedicatedCapacityGuard.name);
  private readonly redis = new Redis(buildRedisConnectionOptions());

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (FLEET_MAX_CONCURRENT_STREAMS === 0 && FLEET_MAX_REQUESTS_PER_MINUTE === 0) {
      return true; // feature not configured -- pure no-op
    }
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();

    try {
      const subscription = await this.prisma.subscription.findUnique({
        where: { organizationId: request.streamKey.organizationId },
        include: { plan: true },
      });
      const isReserved = subscription?.plan.reservedCapacityPercent != null;
      request.streamKey.isReservedCapacityOrg = isReserved;
      if (isReserved) {
        return true; // Enterprise orgs with a reserved floor are never throttled by this guard
      }

      const denied = await this.isReservedFloorAtRisk();
      if (denied) {
        throw new HttpException(
          'Platform is at capacity; dedicated-capacity subscribers are being prioritized. Please retry shortly.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `DedicatedCapacityGuard: failing open due to Redis error: ${err instanceof Error ? err.message : err}`,
      );
      return true; // fail open -- never let this mechanism become a new SPOF
    }
  }

  /**
   * Would admitting one more non-Enterprise request push fleet-wide usage
   * past the point where Enterprise's reserved floor is still guaranteed?
   * BOTH the concurrency and rate checks require an Enterprise org to be
   * actively consuming that specific resource's floor right now -- so with
   * zero Enterprise orgs live, this always returns false for both, and the
   * guard is a complete no-op end-to-end.
   */
  private async isReservedFloorAtRisk(): Promise<boolean> {
    const bucket = Math.floor(Date.now() / 60_000);
    const [totalConcurrent, enterpriseConcurrent, totalReqRate, enterpriseReqRate] =
      await Promise.all([
        this.redis.get('dedicated-capacity:concurrent:total'),
        this.redis.get('dedicated-capacity:concurrent:enterprise'),
        this.redis.get(`dedicated-capacity:reqrate:${bucket}`),
        this.redis.get(`dedicated-capacity:reqrate:enterprise:${bucket}`),
      ]);

    const concurrentBlocked =
      FLEET_MAX_CONCURRENT_STREAMS > 0 &&
      Number(totalConcurrent ?? 0) >= FLEET_MAX_CONCURRENT_STREAMS &&
      Number(enterpriseConcurrent ?? 0) > 0;

    const rateBlocked =
      FLEET_MAX_REQUESTS_PER_MINUTE > 0 &&
      Number(totalReqRate ?? 0) >= FLEET_MAX_REQUESTS_PER_MINUTE &&
      Number(enterpriseReqRate ?? 0) > 0;

    return concurrentBlocked || rateBlocked;
  }

  /** Called by StreamAudioController alongside the existing acquire/release counters. */
  async trackStart(isReserved: boolean): Promise<void> {
    try {
      await this.redis.incr('dedicated-capacity:concurrent:total');
      if (isReserved) await this.redis.incr('dedicated-capacity:concurrent:enterprise');
      const bucket = Math.floor(Date.now() / 60_000);
      const multi = this.redis
        .multi()
        .incr(`dedicated-capacity:reqrate:${bucket}`)
        .expire(`dedicated-capacity:reqrate:${bucket}`, 90);
      if (isReserved) {
        multi
          .incr(`dedicated-capacity:reqrate:enterprise:${bucket}`)
          .expire(`dedicated-capacity:reqrate:enterprise:${bucket}`, 90);
      }
      await multi.exec();
    } catch (err) {
      this.logger.error(
        `DedicatedCapacityGuard.trackStart failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async trackEnd(isReserved: boolean): Promise<void> {
    try {
      await this.redis.decr('dedicated-capacity:concurrent:total');
      if (isReserved) await this.redis.decr('dedicated-capacity:concurrent:enterprise');
    } catch (err) {
      this.logger.error(
        `DedicatedCapacityGuard.trackEnd failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
