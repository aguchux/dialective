import { UsageEstimateService } from './usage-estimate.service';

/**
 * Reading usage back. The arithmetic is simple; the constraint is not.
 *
 * A contributor may learn HOW MUCH their work was streamed and BY HOW MANY
 * organisations, never WHICH ones. Per-organisation figures would tell them how
 * many customers the platform has and begin to characterise them -- the same
 * inference DeckCoverageService suppresses its agreement count to prevent.
 */
function setup(rows: Record<string, unknown>[] = []) {
  const prisma = {
    recordingUsagePeriod: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  return { prisma, service: new UsageEstimateService(prisma as never) };
}

function usageRow(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    contributorId: 'trainer-1',
    recordKind: 'WORD_RECORDING',
    recordingId: 'rec-1',
    streamCount: 4,
    durationMs: BigInt(8000),
    ...overrides,
  };
}

describe('UsageEstimateService.forContributor', () => {
  it('aggregates across subscribers into one figure', async () => {
    const { service } = setup([
      usageRow({ organizationId: 'org-1', streamCount: 4 }),
      usageRow({ organizationId: 'org-2', streamCount: 6, recordingId: 'rec-2' }),
    ]);

    const result = await service.forContributor('trainer-1');

    expect(result.streamCount).toBe(10);
    expect(result.recordingsStreamed).toBe(2);
    expect(result.subscriberCount).toBe(2);
  });

  it('reports how many subscribers, never which ones', async () => {
    // The anonymity boundary. A shape carrying organisation ids would leak the
    // platform's customer list to a contributor.
    const { service } = setup([
      usageRow({ organizationId: 'org-secret-1' }),
      usageRow({ organizationId: 'org-secret-2', recordingId: 'rec-2' }),
    ]);

    const result = await service.forContributor('trainer-1');

    expect(result.subscriberCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain('org-secret');
  });

  it('never returns a money figure', async () => {
    // Converting usage to expected DL needs a pool, and a pool only exists
    // against collected revenue. A speculative amount here would be exactly the
    // stale promise the design warns about.
    const { service } = setup([usageRow()]);

    const result = await service.forContributor('trainer-1');

    expect(Object.keys(result).sort()).toEqual([
      'periodStart',
      'recordingsStreamed',
      'streamCount',
      'subscriberCount',
      'totalDurationMs',
    ]);
  });

  it('counts a recording once even when several subscribers streamed it', async () => {
    const { service } = setup([
      usageRow({ organizationId: 'org-1', recordingId: 'rec-1' }),
      usageRow({ organizationId: 'org-2', recordingId: 'rec-1' }),
    ]);

    const result = await service.forContributor('trainer-1');

    expect(result.recordingsStreamed).toBe(1);
    expect(result.subscriberCount).toBe(2);
  });

  it('counts two kinds sharing a uuid as two recordings', async () => {
    // Independent uuid spaces: keying by bare id would merge them.
    const { service } = setup([
      usageRow({ recordKind: 'WORD_RECORDING', recordingId: 'shared' }),
      usageRow({ recordKind: 'DOMAIN_CONVERSATION_RECORDING', recordingId: 'shared' }),
    ]);

    const result = await service.forContributor('trainer-1');

    expect(result.recordingsStreamed).toBe(2);
  });

  it('returns zeroes rather than failing when there is no usage', async () => {
    // The common case during rollout -- production has zero streaming history.
    const { service } = setup([]);

    const result = await service.forContributor('trainer-1');

    expect(result.streamCount).toBe(0);
    expect(result.subscriberCount).toBe(0);
    expect(result.totalDurationMs).toBe('0');
  });

  it('scopes to the contributor and the current period', async () => {
    const { prisma, service } = setup();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    try {
      await service.forContributor('trainer-1');
      expect(prisma.recordingUsagePeriod.findMany.mock.calls[0][0].where).toEqual({
        contributorId: 'trainer-1',
        periodStart: new Date('2026-03-01T00:00:00.000Z'),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('serialises duration as a string, so a BigInt cannot break a JSON response', async () => {
    const { service } = setup([usageRow({ durationMs: BigInt('9007199254740993') })]);

    const result = await service.forContributor('trainer-1');

    expect(result.totalDurationMs).toBe('9007199254740993');
  });
});

describe('UsageEstimateService.forOrganization', () => {
  it('reports the contributor count, which is admin-only', async () => {
    // The mirror-image leak: a SUBSCRIBER learning how many people are behind
    // the data they licensed. This method is admin-facing for that reason.
    const { service } = setup([
      usageRow({ contributorId: 'trainer-1' }),
      usageRow({ contributorId: 'trainer-2', recordingId: 'rec-2' }),
    ]);

    const result = await service.forOrganization('org-1');

    expect(result.contributorCount).toBe(2);
    expect(result.streamCount).toBe(8);
  });

  it('gives the denominator a pool divides by', async () => {
    // pool share = this contributor's streams / this subscriber's total streams.
    const { service } = setup([
      usageRow({ contributorId: 'trainer-1', streamCount: 3 }),
      usageRow({ contributorId: 'trainer-2', streamCount: 7, recordingId: 'rec-2' }),
    ]);

    const result = await service.forOrganization('org-1');

    expect(result.streamCount).toBe(10);
  });
});
