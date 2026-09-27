import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StreamRecordKind } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { kindKey } from '../stream-record-kind.util';

/**
 * The first day of the month containing `at`, UTC midnight.
 *
 * Same anchor convention as UsageCounter.periodStart, deliberately: two
 * different notions of "this period" in one system is how a usage figure and a
 * quota figure come to disagree for reasons nobody can reconstruct.
 */
export function periodStartOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** The first day of the month AFTER the one containing `at`. */
export function periodEndOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

export interface AggregationResult {
  periodStart: Date;
  /** Distinct (record, org) pairs written. */
  rowsWritten: number;
  /** Allowed audio log rows that fed those pairs. */
  logRowsRead: number;
  /** Rows skipped because no contributor could be resolved -- see resolveContributors. */
  unattributable: number;
}

/** One aggregated bucket, before contributor resolution. */
interface UsageBucket {
  recordKind: StreamRecordKind;
  recordingId: string;
  organizationId: string;
  streamCount: number;
  durationMs: bigint;
  bytesStreamed: bigint;
}

const WRITE_CHUNK = 500;

/**
 * Turns the stream access log into the per-record usage rows a revenue pool
 * divides.
 *
 * Three properties define it, and each rules out a simpler implementation:
 *
 * 1. **It counts `allowed` audio requests only.** A 403 is not usage. Denied
 *    and errored rows are logged too, so without this filter a subscriber
 *    whose key lacks a purpose would generate royalties by being refused.
 *
 * 2. **It recomputes, never increments.** A period is aggregated from the log
 *    each time, so a re-run after a partial failure converges instead of
 *    double-counting. This is what makes the job safe to retry, and it is why
 *    RecordingUsagePeriod rows are overwritten rather than upserted with
 *    `increment`.
 *
 * 3. **It resolves the contributor at aggregation time and stores it.**
 *    WordRecording.userId is nullable, so deferring the lookup to settlement
 *    would let an account deletion make already-earned usage unattributable.
 *
 * What it deliberately does NOT do: decide who earns. Eligibility -- whether a
 * recording is licensed, published, and covered for a purpose -- is
 * RightsService's question and is asked at settlement, against the licence
 * state then. Baking an eligibility decision into a usage row would freeze a
 * rights answer that is supposed to be live.
 */
@Injectable()
export class UsageAggregationService {
  private readonly logger = new Logger(UsageAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate one period.
   *
   * Defaults to the PREVIOUS month rather than the current one: a period still
   * in progress has no final number, and an aggregation of it would be
   * overwritten by the next run anyway. Passing an explicit date is how the
   * live-estimate path aggregates the current period on purpose.
   */
  async aggregatePeriod(at?: Date): Promise<AggregationResult> {
    const anchor = at ?? previousMonthAnchor();
    const periodStart = periodStartOf(anchor);
    const periodEnd = periodEndOf(anchor);

    const buckets = await this.readBuckets(periodStart, periodEnd);
    if (buckets.size === 0) {
      this.logger.log(
        `No allowed audio usage in period ${periodStart.toISOString().slice(0, 10)}`,
      );
      return { periodStart, rowsWritten: 0, logRowsRead: 0, unattributable: 0 };
    }

    const contributors = await this.resolveContributors([...buckets.values()]);

    const rows: Prisma.RecordingUsagePeriodCreateManyInput[] = [];
    let unattributable = 0;
    let logRowsRead = 0;

    for (const bucket of buckets.values()) {
      logRowsRead += bucket.streamCount;
      const contributorId = contributors.get(kindKey(bucket.recordKind, bucket.recordingId));
      if (!contributorId) {
        // A recording whose owner is gone, or an id the log holds that no
        // record table has. Counted and logged rather than attributed to a
        // placeholder: a pool must never pay a contributor who cannot be
        // named, and silently dropping it would hide a real data problem.
        unattributable += 1;
        continue;
      }
      rows.push({
        recordKind: bucket.recordKind,
        recordingId: bucket.recordingId,
        contributorId,
        organizationId: bucket.organizationId,
        periodStart,
        streamCount: bucket.streamCount,
        durationMs: bucket.durationMs,
        bytesStreamed: bucket.bytesStreamed,
      });
    }

    await this.replacePeriod(periodStart, rows);

    if (unattributable > 0) {
      this.logger.warn(
        `Period ${periodStart.toISOString().slice(0, 10)}: ${unattributable} usage buckets had no resolvable contributor and were not written`,
      );
    }
    this.logger.log(
      `Aggregated period ${periodStart.toISOString().slice(0, 10)}: ${rows.length} rows from ${logRowsRead} allowed audio requests`,
    );

    return { periodStart, rowsWritten: rows.length, logRowsRead, unattributable };
  }

  /**
   * Group the period's allowed audio requests by (kind, record, org).
   *
   * Uses groupBy rather than pulling rows into memory: the access log grows
   * without bound, and a period on a busy month could be millions of rows.
   */
  private async readBuckets(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<string, UsageBucket>> {
    const grouped = await this.prisma.streamAccessLog.groupBy({
      by: ['recordKind', 'recordingId', 'organizationId'],
      where: {
        // The index this relies on is
        // [organizationId, createdAt, recordKind, recordingId].
        createdAt: { gte: periodStart, lt: periodEnd },
        requestType: 'audio',
        // Only usage that was actually served. See the class doc comment.
        entitlementDecision: 'allowed',

        recordingId: { not: null },
        recordKind: { not: null },
      },
      _count: { _all: true },
      _sum: { durationStreamedMs: true, bytesStreamed: true },
    });

    const buckets = new Map<string, UsageBucket>();
    for (const row of grouped) {
      // Narrowed by the where clause above; the types stay nullable because
      // Prisma cannot see that.
      if (!row.recordingId || !row.recordKind) continue;
      const key = `${kindKey(row.recordKind, row.recordingId)}:${row.organizationId}`;
      buckets.set(key, {
        recordKind: row.recordKind,
        recordingId: row.recordingId,
        organizationId: row.organizationId,
        streamCount: row._count._all,
        durationMs: BigInt(row._sum.durationStreamedMs ?? 0),
        bytesStreamed: row._sum.bytesStreamed ?? BigInt(0),
      });
    }
    return buckets;
  }

  /**
   * Map each (kind, record) to its contributor.
   *
   * Reads the record tables directly rather than going through the VDCL
   * manifest, because this answers "who made it", not "is it licensed". Those
   * are different questions and conflating them would mean unlicensed usage
   * silently vanished from the usage record, leaving nothing to explain a gap
   * with.
   */
  private async resolveContributors(buckets: UsageBucket[]): Promise<Map<string, string>> {
    const wordIds = buckets
      .filter((b) => b.recordKind === StreamRecordKind.WORD_RECORDING)
      .map((b) => b.recordingId);
    const domainIds = buckets
      .filter((b) => b.recordKind === StreamRecordKind.DOMAIN_CONVERSATION_RECORDING)
      .map((b) => b.recordingId);

    const [words, conversations] = await Promise.all([
      wordIds.length
        ? this.prisma.wordRecording.findMany({
            where: { id: { in: [...new Set(wordIds)] } },
            select: { id: true, userId: true },
          })
        : Promise.resolve([]),
      domainIds.length
        ? this.prisma.domainConversationRecording.findMany({
            where: { id: { in: [...new Set(domainIds)] } },
            select: { id: true, userId: true },
          })
        : Promise.resolve([]),
    ]);

    const map = new Map<string, string>();
    for (const row of words) {
      if (row.userId) map.set(kindKey(StreamRecordKind.WORD_RECORDING, row.id), row.userId);
    }
    for (const row of conversations) {
      if (row.userId) {
        map.set(kindKey(StreamRecordKind.DOMAIN_CONVERSATION_RECORDING, row.id), row.userId);
      }
    }
    return map;
  }

  /**
   * Replace the period's rows wholesale, in one transaction.
   *
   * Delete-then-insert rather than upsert-per-row, for two reasons. It makes a
   * re-run exactly idempotent including for buckets that have since
   * disappeared -- an upsert loop would leave a stale row behind for usage the
   * log no longer shows. And it is one round trip per chunk instead of one per
   * record, which matters at the row counts a busy period produces.
   *
   * Transactional so a period is never half-replaced: a settlement reading a
   * partially-deleted period would compute a pool from a fraction of the
   * usage and underpay everyone in it.
   */
  private async replacePeriod(
    periodStart: Date,
    rows: Prisma.RecordingUsagePeriodCreateManyInput[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.recordingUsagePeriod.deleteMany({ where: { periodStart } });
      for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
        await tx.recordingUsagePeriod.createMany({ data: rows.slice(i, i + WRITE_CHUNK) });
      }
    });
  }
}

/**
 * An instant inside the previous month.
 *
 * Day 1 of the current month minus one day, rather than "month - 1" on the
 * current date: subtracting a month from the 31st lands on a different month
 * depending on the month, and this job runs early on the 1st.
 */
function previousMonthAnchor(now = new Date()): Date {
  const thisMonth = periodStartOf(now);
  return new Date(thisMonth.getTime() - 24 * 60 * 60 * 1000);
}
