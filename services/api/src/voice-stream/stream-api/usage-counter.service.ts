import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
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
 *
 * tryReserveRequest() is the exception to that split: it's the one atomic
 * check-and-increment in this file, used by QuotaGuard to close the
 * check-then-serve race that a plain getCurrentUsage()-then-later-increment()
 * pair leaves open (N concurrent requests can all read the same
 * pre-increment count and all pass). Only the *request-count* quota can be
 * enforced this way pre-serve -- byte usage isn't known until after the
 * response streams, so bytesUsed enforcement necessarily stays a pre-serve
 * read against the prior request's completed total, same as before.
 */
@Injectable()
export class UsageCounterService {
  private readonly logger = new Logger(UsageCounterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically increments requestsUsed by 1 and reports whether the counter
   * is still within `requestQuota` afterward -- single round trip, no
   * separate read-then-write window. INSERT .. ON CONFLICT DO UPDATE always
   * performs the increment (so usage stays accurate even once over quota);
   * the caller decides whether to reject based on the returned count, same
   * as QuotaGuard's existing >= comparison.
   */
  async tryReserveRequest(organizationId: string, requestQuota: number): Promise<{ withinQuota: boolean }> {
    const periodStart = currentPeriodStart();
    const rows = await this.prisma.$queryRaw<Array<{ requestsUsed: number }>>(Prisma.sql`
      INSERT INTO usage_counters (id, "organizationId", "periodStart", "bytesUsed", "requestsUsed")
      VALUES (gen_random_uuid(), ${organizationId}, ${periodStart}, 0, 1)
      ON CONFLICT ("organizationId", "periodStart")
      DO UPDATE SET "requestsUsed" = usage_counters."requestsUsed" + 1
      RETURNING "requestsUsed"
    `);
    const requestsUsed = rows[0]?.requestsUsed ?? 1;
    return { withinQuota: requestsUsed <= requestQuota };
  }

  /**
   * Bytes only -- requestsUsed is no longer incremented here. It would
   * double-count against tryReserveRequest()'s atomic pre-serve reservation
   * (both would fire for every QuotaGuard-covered request), reopening the
   * exact race tryReserveRequest exists to close for orgs with an unlimited
   * request quota that later get one, or drifting the two counters apart
   * for uses that always had one.  When requestQuota is null (unlimited),
   * requestsUsed simply isn't tracked -- nothing reads it in that case, and
   * per-request counts remain visible via StreamAccessLog.count() (see
   * StreamManifestService.getUsageSummary).
   */
  async increment(organizationId: string, params: { bytes?: bigint }): Promise<void> {
    if (params.bytes == null) return;
    const periodStart = currentPeriodStart();
    try {
      await this.prisma.usageCounter.upsert({
        where: { organizationId_periodStart: { organizationId, periodStart } },
        create: {
          organizationId,
          periodStart,
          bytesUsed: params.bytes,
          requestsUsed: 0,
        },
        update: {
          bytesUsed: { increment: params.bytes },
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
