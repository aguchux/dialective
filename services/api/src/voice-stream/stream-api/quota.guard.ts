import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageCounterService } from './usage-counter.service';
import { AuthenticatedStreamKeyRequest } from './stream-key-auth.guard';

/**
 * Enforces SubscriptionPlan.monthlyByteQuota/monthlyRequestQuota (doc
 * section 61's "advanced quota policies") -- null = unlimited, same
 * convention as every other SubscriptionPlan limit field. Reads the
 * current UsageCounter row *before* serving; the actual increment happens
 * afterward in StreamAccessLogService.record(), so accounting and
 * enforcement are deliberately separate steps.
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

    if (requestQuota != null && usage.requestsUsed >= requestQuota) {
      throw new HttpException(
        `Monthly request quota exceeded, resets ${nextPeriodStart.toISOString().slice(0, 10)}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (byteQuota != null && usage.bytesUsed >= byteQuota) {
      throw new HttpException(
        `Monthly data quota exceeded, resets ${nextPeriodStart.toISOString().slice(0, 10)}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
