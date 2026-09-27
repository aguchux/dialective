import { RoyaltyRateService } from './royalty-rate.service';

/**
 * The rate resolver exists for one reason: settlement must never read "the
 * current rate". These tests pin the guarantee in section 5.4 of the design
 * doc -- a rate change applies only to usage streamed after it -- and the
 * idempotency property that follows from it.
 */
function setup(rows: { sharePercent: number; effectiveFrom: Date }[] = []) {
  const prisma = {
    royaltyRatePeriod: {
      findFirst: jest.fn(async (args: { where?: { effectiveFrom?: { lte: Date } } }) => {
        if (!args?.where?.effectiveFrom) {
          return rows.length ? { id: 'seeded' } : null;
        }
        const cutoff = args.where.effectiveFrom.lte;
        const eligible = rows
          .filter((r) => r.effectiveFrom.getTime() <= cutoff.getTime())
          .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
        return eligible[0] ?? null;
      }),
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new RoyaltyRateService(prisma as never) };
}

const MARCH = new Date('2026-03-01T00:00:00.000Z');
const APRIL = new Date('2026-04-01T00:00:00.000Z');

describe('RoyaltyRateService.rateForPeriod', () => {
  it('returns the rate in force at the period, not the newest rate', async () => {
    // THE property. A change scheduled for April must not reprice March, even
    // though April is the current rate by the time a late settlement runs.
    const { service } = setup([
      { sharePercent: 30, effectiveFrom: MARCH },
      { sharePercent: 45, effectiveFrom: APRIL },
    ]);

    expect(await service.rateForPeriod(MARCH)).toBe(30);
    expect(await service.rateForPeriod(APRIL)).toBe(45);
  });

  it('makes a re-run reproduce the original answer across a rate change', async () => {
    // The idempotency consequence: settling March twice, with a change landing
    // in between, must give the same rate both times.
    const { service } = setup([{ sharePercent: 30, effectiveFrom: MARCH }]);
    const before = await service.rateForPeriod(MARCH);

    const { service: after } = setup([
      { sharePercent: 30, effectiveFrom: MARCH },
      { sharePercent: 45, effectiveFrom: APRIL },
    ]);

    expect(await after.rateForPeriod(MARCH)).toBe(before);
  });

  it('carries a rate forward to later periods with no change of their own', async () => {
    const { service } = setup([{ sharePercent: 30, effectiveFrom: MARCH }]);

    expect(await service.rateForPeriod(new Date('2026-09-01T00:00:00.000Z'))).toBe(30);
  });

  it('returns null rather than a default when no rate covers the period', async () => {
    // A pool computed at an assumed rate is a silently wrong payout, so the
    // correct answer to "no rate was scheduled" is no rate, and the caller
    // must refuse to compute.
    const { service } = setup([{ sharePercent: 30, effectiveFrom: APRIL }]);

    expect(await service.rateForPeriod(MARCH)).toBeNull();
  });
});

describe('RoyaltyRateService.scheduleChange', () => {
  it('schedules from the NEXT period, never the current one', async () => {
    // Repricing a period already part-way through is exactly what 5.4 forbids:
    // usage in it was streamed under the existing rate.
    const { prisma, service } = setup();

    const effectiveFrom = await service.scheduleChange(
      45,
      'admin-1',
      new Date('2026-03-20T12:00:00.000Z'),
    );

    expect(effectiveFrom).toEqual(APRIL);
    expect(prisma.royaltyRatePeriod.upsert.mock.calls[0][0].where).toEqual({
      effectiveFrom: APRIL,
    });
  });

  it('rolls the year over from December', async () => {
    const { service } = setup();

    const effectiveFrom = await service.scheduleChange(
      45,
      null,
      new Date('2026-12-15T00:00:00.000Z'),
    );

    expect(effectiveFrom).toEqual(new Date('2027-01-01T00:00:00.000Z'));
  });

  it('replaces a pending change rather than colliding with it', async () => {
    // An admin who changes their mind twice before the period starts should end
    // with one scheduled rate, not a unique-constraint error.
    const { prisma, service } = setup();

    await service.scheduleChange(45, 'admin-1', new Date('2026-03-05T00:00:00.000Z'));
    await service.scheduleChange(40, 'admin-1', new Date('2026-03-20T00:00:00.000Z'));

    const second = prisma.royaltyRatePeriod.upsert.mock.calls[1][0];
    expect(second.where).toEqual({ effectiveFrom: APRIL });
    expect(second.update.sharePercent).toBe(40);
  });

  it('never writes a past anchor, so a rate already used cannot be rewritten', async () => {
    const { prisma, service } = setup();
    const now = new Date('2026-03-20T00:00:00.000Z');

    await service.scheduleChange(45, null, now);

    const written: Date = prisma.royaltyRatePeriod.upsert.mock.calls[0][0].where.effectiveFrom;
    expect(written.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('RoyaltyRateService.ensureBaseline', () => {
  it('seeds the current period, so the first settled period has a rate', async () => {
    // Backdated deliberately: the schedule is empty, so there is no earlier
    // rate this could be repricing.
    const { prisma, service } = setup();

    await service.ensureBaseline(30, new Date('2026-03-20T00:00:00.000Z'));

    expect(prisma.royaltyRatePeriod.create.mock.calls[0][0].data).toEqual({
      sharePercent: 30,
      effectiveFrom: MARCH,
      changedByUserId: null,
    });
  });

  it('leaves an existing schedule completely alone', async () => {
    // Idempotent so it can run on every boot. Moving a rate that settlement may
    // already have used would reprice a computed pool.
    const { prisma, service } = setup([{ sharePercent: 45, effectiveFrom: MARCH }]);

    await service.ensureBaseline(30);

    expect(prisma.royaltyRatePeriod.create).not.toHaveBeenCalled();
  });
});
