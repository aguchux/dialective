import { StreamRecordKind } from '@dialectiva/db';
import {
  UsageAggregationService,
  periodEndOf,
  periodStartOf,
} from './usage-aggregation.service';

/**
 * Usage aggregation is what a revenue pool divides. Two properties matter more
 * than the arithmetic: only usage that was actually served may count, and a
 * re-run must converge rather than double-count -- a settlement job that can be
 * retried is worthless if retrying inflates what it pays.
 */
function setup() {
  const tx = {
    recordingUsagePeriod: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    streamAccessLog: { groupBy: jest.fn().mockResolvedValue([]) },
    wordRecording: { findMany: jest.fn().mockResolvedValue([]) },
    domainConversationRecording: { findMany: jest.fn().mockResolvedValue([]) },
    recordingUsagePeriod: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const service = new UsageAggregationService(prisma as never);
  return { prisma, tx, service };
}

/** One groupBy row as Prisma returns it. */
function bucket(overrides: Record<string, unknown> = {}) {
  return {
    recordKind: StreamRecordKind.WORD_RECORDING,
    recordingId: 'rec-1',
    organizationId: 'org-1',
    _count: { _all: 3 },
    _sum: { durationStreamedMs: 9000, bytesStreamed: BigInt(4096) },
    ...overrides,
  };
}

const MARCH = new Date('2026-03-15T12:00:00.000Z');

describe('period anchors', () => {
  it('anchors a period to the first UTC midnight of its month', () => {
    expect(periodStartOf(MARCH)).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(periodEndOf(MARCH)).toEqual(new Date('2026-04-01T00:00:00.000Z'));
  });

  it('rolls the year over at December', () => {
    const dec = new Date('2026-12-20T00:00:00.000Z');
    expect(periodEndOf(dec)).toEqual(new Date('2027-01-01T00:00:00.000Z'));
  });

  it('is stable for any instant within the month', () => {
    // A period boundary that shifted with the time of day would put usage in
    // the wrong pool for requests near midnight.
    const first = new Date('2026-03-01T00:00:00.000Z');
    const last = new Date('2026-03-31T23:59:59.999Z');
    expect(periodStartOf(first)).toEqual(periodStartOf(last));
  });
});

describe('UsageAggregationService.aggregatePeriod', () => {
  it('counts only allowed audio requests', async () => {
    // A 403 is not usage. Denied rows are logged too, so without this filter a
    // subscriber whose key lacks a purpose would generate royalties by being
    // refused.
    const { prisma, service } = setup();
    await service.aggregatePeriod(MARCH);

    const where = prisma.streamAccessLog.groupBy.mock.calls[0][0].where;
    expect(where.entitlementDecision).toBe('allowed');
    expect(where.requestType).toBe('audio');
  });

  it('scopes the read to the period, half-open', async () => {
    // gte start, lt end: an inclusive end would count the first instant of the
    // next month in both periods.
    const { prisma, service } = setup();
    await service.aggregatePeriod(MARCH);

    const where = prisma.streamAccessLog.groupBy.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
      lt: new Date('2026-04-01T00:00:00.000Z'),
    });
  });

  it('groups by record kind as well as id', async () => {
    // The two record tables have independent uuid spaces, so grouping by id
    // alone would merge a word recording and a conversation into one bucket.
    const { prisma, service } = setup();
    await service.aggregatePeriod(MARCH);

    expect(prisma.streamAccessLog.groupBy.mock.calls[0][0].by).toEqual([
      'recordKind',
      'recordingId',
      'organizationId',
    ]);
  });

  it('writes one row per record per organisation with the resolved contributor', async () => {
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([bucket()]);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: 'rec-1', userId: 'trainer-1' }]);

    const result = await service.aggregatePeriod(MARCH);

    const rows = tx.recordingUsagePeriod.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      {
        recordKind: 'WORD_RECORDING',
        recordingId: 'rec-1',
        contributorId: 'trainer-1',
        organizationId: 'org-1',
        periodStart: new Date('2026-03-01T00:00:00.000Z'),
        streamCount: 3,
        durationMs: BigInt(9000),
        bytesStreamed: BigInt(4096),
      },
    ]);
    expect(result.rowsWritten).toBe(1);
  });

  it('keeps the same recording separate per subscriber', async () => {
    // Pools are per-subscriber: one recording earns separately from each
    // organisation that streams it, so merging them would collapse two pools
    // into one.
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([
      bucket({ organizationId: 'org-1', _count: { _all: 2 } }),
      bucket({ organizationId: 'org-2', _count: { _all: 5 } }),
    ]);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: 'rec-1', userId: 'trainer-1' }]);

    await service.aggregatePeriod(MARCH);

    const rows = tx.recordingUsagePeriod.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { organizationId: string; streamCount: number }) => [
      r.organizationId,
      r.streamCount,
    ])).toEqual([
      ['org-1', 2],
      ['org-2', 5],
    ]);
  });

  it('resolves domain-conversation contributors from their own table', async () => {
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([
      bucket({
        recordKind: StreamRecordKind.DOMAIN_CONVERSATION_RECORDING,
        recordingId: 'dc-1',
      }),
    ]);
    prisma.domainConversationRecording.findMany.mockResolvedValue([
      { id: 'dc-1', userId: 'trainer-2' },
    ]);

    await service.aggregatePeriod(MARCH);

    const rows = tx.recordingUsagePeriod.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      recordKind: 'DOMAIN_CONVERSATION_RECORDING',
      contributorId: 'trainer-2',
    });
  });

  it('does not let a shared uuid across kinds resolve the wrong contributor', async () => {
    const shared = 'same-uuid';
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([
      bucket({ recordKind: StreamRecordKind.WORD_RECORDING, recordingId: shared }),
      bucket({
        recordKind: StreamRecordKind.DOMAIN_CONVERSATION_RECORDING,
        recordingId: shared,
      }),
    ]);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: shared, userId: 'word-owner' }]);
    prisma.domainConversationRecording.findMany.mockResolvedValue([
      { id: shared, userId: 'conversation-owner' },
    ]);

    await service.aggregatePeriod(MARCH);

    const rows = tx.recordingUsagePeriod.createMany.mock.calls[0][0].data;
    const byKind = new Map(
      rows.map((r: { recordKind: string; contributorId: string }) => [r.recordKind, r.contributorId]),
    );
    expect(byKind.get('WORD_RECORDING')).toBe('word-owner');
    expect(byKind.get('DOMAIN_CONVERSATION_RECORDING')).toBe('conversation-owner');
  });

  it('skips usage whose contributor cannot be resolved, and reports it', async () => {
    // A pool must never pay a contributor who cannot be named. Dropping these
    // silently would hide a real data problem.
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([bucket()]);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: 'rec-1', userId: null }]);

    const result = await service.aggregatePeriod(MARCH);

    expect(result.unattributable).toBe(1);
    expect(result.rowsWritten).toBe(0);
    expect(tx.recordingUsagePeriod.createMany).not.toHaveBeenCalled();
  });

  it('replaces the period rather than incrementing it, so a re-run converges', async () => {
    // The property that makes the job retryable. An upsert-with-increment would
    // double-count every bucket on a second run.
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([bucket()]);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: 'rec-1', userId: 'trainer-1' }]);

    await service.aggregatePeriod(MARCH);

    expect(tx.recordingUsagePeriod.deleteMany).toHaveBeenCalledWith({
      where: { periodStart: new Date('2026-03-01T00:00:00.000Z') },
    });
    // Delete and insert in ONE transaction: a settlement reading a
    // half-replaced period would compute a pool from a fraction of the usage.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('writes nothing and touches no period when there was no usage', async () => {
    // Not the same as "aggregate to zero": deleting a period that has no fresh
    // data would discard a previous, correct aggregation.
    const { prisma, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([]);

    const result = await service.aggregatePeriod(MARCH);

    expect(result.rowsWritten).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records duration and bytes but counts streams for the split', async () => {
    // durationStreamedMs is the record's FULL duration regardless of range
    // bytes served, so it is reporting-only -- splitting by it would over-reward
    // a client making many small range requests.
    const { prisma, tx, service } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([
      bucket({ _count: { _all: 7 }, _sum: { durationStreamedMs: 1000, bytesStreamed: BigInt(9) } }),
    ]);
    prisma.wordRecording.findMany.mockResolvedValue([{ id: 'rec-1', userId: 'trainer-1' }]);

    await service.aggregatePeriod(MARCH);

    const [row] = tx.recordingUsagePeriod.createMany.mock.calls[0][0].data;
    expect(row.streamCount).toBe(7);
    expect(row.durationMs).toBe(BigInt(1000));
    expect(row.bytesStreamed).toBe(BigInt(9));
  });

  it('defaults to the previous month, not the one in progress', async () => {
    // A period still running has no final number, and aggregating it would be
    // overwritten by the next run anyway.
    const { prisma, service } = setup();
    jest.useFakeTimers().setSystemTime(new Date('2026-04-02T03:00:00.000Z'));
    try {
      await service.aggregatePeriod();
      const where = prisma.streamAccessLog.groupBy.mock.calls[0][0].where;
      expect(where.createdAt.gte).toEqual(new Date('2026-03-01T00:00:00.000Z'));
      expect(where.createdAt.lt).toEqual(new Date('2026-04-01T00:00:00.000Z'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('picks the right previous month when run on the 1st', async () => {
    // Subtracting a month from a 31st lands on a different month depending on
    // the month, which is why the anchor is day-1-minus-a-day.
    const { prisma, service } = setup();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T03:00:00.000Z'));
    try {
      await service.aggregatePeriod();
      const where = prisma.streamAccessLog.groupBy.mock.calls[0][0].where;
      expect(where.createdAt.gte).toEqual(new Date('2025-12-01T00:00:00.000Z'));
    } finally {
      jest.useRealTimers();
    }
  });
});
