import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { periodStartOf } from './usage-aggregation.service';

export interface ContributorPeriodUsage {
  periodStart: Date;
  /** This contributor's allowed streams in the period, across every subscriber. */
  streamCount: number;
  /** Distinct recordings of theirs that were streamed. */
  recordingsStreamed: number;
  /**
   * How many subscriber organisations streamed them.
   *
   * A count, never the identities. A contributor learning WHICH organisations
   * streamed their work would learn who Dialect Library's customers are, and
   * amounts per organisation would begin to characterise them. See the
   * mutual-anonymity constraint in docs/Stream-Revenue-Sharing-Engine.md.
   */
  subscriberCount: number;
  totalDurationMs: string;
}

/**
 * Reading usage back, for the contributor dashboard and for admin.
 *
 * Everything here is computed on read. Nothing is stored, which is the point:
 * a stored estimate becomes a stale promise, and this figure legitimately moves
 * DOWN as other contributors accumulate usage -- a contributor holding 60% of a
 * subscriber's streams on day 3 may hold 20% by day 30 without their own
 * streams changing at all, because the denominator grew.
 *
 * That makes an estimate not a liability, and any surface showing it has to say
 * so. This service returns usage, deliberately not money: converting usage to
 * an expected DL figure needs a revenue pool, and a pool only exists against
 * collected revenue (Phase 4+). Returning a speculative amount from here would
 * be the stale promise the design warns about.
 */
@Injectable()
export class UsageEstimateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One contributor's usage in a period, aggregated across subscribers.
   *
   * Aggregated on purpose: one row per organisation would tell the contributor
   * how many customers the platform has.
   */
  async forContributor(contributorId: string, at?: Date): Promise<ContributorPeriodUsage> {
    const periodStart = periodStartOf(at ?? new Date());

    const rows = await this.prisma.recordingUsagePeriod.findMany({
      where: { contributorId, periodStart },
      select: {
        organizationId: true,
        recordKind: true,
        recordingId: true,
        streamCount: true,
        durationMs: true,
      },
    });

    const organisations = new Set<string>();
    const recordings = new Set<string>();
    let streamCount = 0;
    let totalDurationMs = BigInt(0);

    for (const row of rows) {
      organisations.add(row.organizationId);
      // Keyed by kind too: the two record tables have independent uuid spaces.
      recordings.add(`${row.recordKind}:${row.recordingId}`);
      streamCount += row.streamCount;
      totalDurationMs += row.durationMs;
    }

    return {
      periodStart,
      streamCount,
      recordingsStreamed: recordings.size,
      subscriberCount: organisations.size,
      totalDurationMs: totalDurationMs.toString(),
    };
  }

  /**
   * One subscriber's period totals -- the denominator a pool divides by.
   *
   * Admin-facing. `contributorCount` is exactly the figure a subscriber must
   * never see: it says how many people are behind the data they licensed,
   * which is the inference DeckCoverageService suppresses its agreement count
   * to prevent.
   */
  async forOrganization(
    organizationId: string,
    at?: Date,
  ): Promise<{
    periodStart: Date;
    streamCount: number;
    contributorCount: number;
    recordingsStreamed: number;
  }> {
    const periodStart = periodStartOf(at ?? new Date());
    const rows = await this.prisma.recordingUsagePeriod.findMany({
      where: { organizationId, periodStart },
      select: {
        contributorId: true,
        recordKind: true,
        recordingId: true,
        streamCount: true,
      },
    });

    const contributors = new Set<string>();
    const recordings = new Set<string>();
    let streamCount = 0;
    for (const row of rows) {
      contributors.add(row.contributorId);
      recordings.add(`${row.recordKind}:${row.recordingId}`);
      streamCount += row.streamCount;
    }

    return {
      periodStart,
      streamCount,
      contributorCount: contributors.size,
      recordingsStreamed: recordings.size,
    };
  }
}
