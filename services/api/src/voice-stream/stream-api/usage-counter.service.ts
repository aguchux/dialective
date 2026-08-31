import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface CurrentUsage {
  periodStart: Date;
  bytesUsed: bigint;
  requestsUsed: number;
}

/**
 * Accumulated monthly usage per organization (doc section 61's "advanced
 * quota policies"). increment() is called from
 * StreamAccessLogService.record()'s choke point -- best-effort, never
 * throws, matching that method's own posture. getCurrentUsage() is read by
 * QuotaGuard *before* a request is served; the increment always happens
 * *after* (accounting and enforcement are deliberately separate steps,
 * same split as ConcurrentStreamGuard's acquire/release).
 */
@Injectable()
export class UsageCounterService {
  private readonly logger = new Logger(UsageCounterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async increment(organizationId: string, params: { bytes?: bigint; requests: number }): Promise<void> {
    const periodStart = currentPeriodStart();
    try {
      await this.prisma.usageCounter.upsert({
        where: { organizationId_periodStart: { organizationId, periodStart } },
        create: {
          organizationId,
          periodStart,
          bytesUsed: params.bytes ?? BigInt(0),
          requestsUsed: params.requests,
        },
        update: {
          bytesUsed: { increment: params.bytes ?? BigInt(0) },
          requestsUsed: { increment: params.requests },
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to increment usage counter for org=${organizationId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getCurrentUsage(organizationId: string): Promise<CurrentUsage> {
    const periodStart = currentPeriodStart();
    const row = await this.prisma.usageCounter.findUnique({
      where: { organizationId_periodStart: { organizationId, periodStart } },
    });
    return {
      periodStart,
      bytesUsed: row?.bytesUsed ?? BigInt(0),
      requestsUsed: row?.requestsUsed ?? 0,
    };
  }
}
