import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageCounterService } from './usage-counter.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

/**
 * Enforces SubscriptionPlan.monthlyByteQuota/monthlyRequestQuota (doc
 * section 61's "advanced quota policies") -- null = unlimited, same
 * convention as every other SubscriptionPlan limit field.
 *
 * Request-count quota is enforced via UsageCounterService.tryReserveRequest,
 * a single atomic INSERT..ON CONFLICT DO UPDATE that increments and checks
 * in one round trip -- this closes a check-then-serve race where a plain
 * "read usage, then increment after serving" (the actual increment happens
 * in StreamAccessLogService.record() once bytes have streamed) leaves a
 * window for N concurrent requests to all read the same pre-increment count
 * and all pass. Byte-quota enforcement stays a pre-serve read of the last
 * completed total -- bytes streamed by *this* request aren't known until
 * after it completes, so they can't be reserved atomically up front; this
 * mirrors the accepted tradeoff already documented on ConcurrentStreamGuard.
 */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageCounter: UsageCounterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStreamKeyRequest>();
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId: request.streamKey.organizationId },
      include: { plan: true },
    });
    const byteQuota = subscription?.plan.monthlyByteQuota;
    const requestQuota = subscription?.plan.monthlyRequestQuota;
    if (byteQuota == null && requestQuota == null) {
      return true;
    }

    const usage = await this.usageCounter.getCurrentUsage(request.streamKey.organizationId);
    const nextPeriodStart = new Date(
      Date.UTC(usage.periodStart.getUTCFullYear(), usage.periodStart.getUTCMonth() + 1, 1),
    );

    if (byteQuota != null && usage.bytesUsed >= byteQuota) {
      throw new HttpException(
        `Monthly data quota exceeded, resets ${nextPeriodStart.toISOString().slice(0, 10)}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (requestQuota != null) {
      const { withinQuota } = await this.usageCounter.tryReserveRequest(
        request.streamKey.organizationId,
        requestQuota,
      );
      if (!withinQuota) {
        throw new HttpException(
          `Monthly request quota exceeded, resets ${nextPeriodStart.toISOString().slice(0, 10)}`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }
}
