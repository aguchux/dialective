import { SettlementService } from './settlement.service';

/**
 * The per-contributor payout gate inside settlement.
 *
 * settlement-job resolves the licensed set ONCE per run and tests each
 * recording's owner against it, rather than querying a licence per recording:
 * a batch can cover thousands of rows, and the set is one row per signed
 * contributor. These tests pin both halves of that -- the set's membership
 * rules, and that it is not consulted at all while the gate is off.
 */
function buildPrisma(overrides: { suppression?: boolean; agreements?: unknown[] } = {}) {
  return {
    platformSettings: {
      upsert: jest.fn().mockResolvedValue({
        vdclPayoutSuppressionEnabled: overrides.suppression ?? false,
      }),
    },
    vdclAgreement: {
      findMany: jest.fn().mockResolvedValue(overrides.agreements ?? []),
    },
  } as never;
}

function buildService(prisma: never) {
  return new SettlementService(
    prisma,
    { deleteObject: jest.fn() } as never,
    { notifyReferralPayoutBonus: jest.fn() } as never,
  );
}

describe('SettlementService suppressedContributorIds', () => {
  it('is empty while the gate is off, without querying agreements', async () => {
    // The production default. A settlement run must not pay for a query that
    // cannot change its answer.
    const prisma = buildPrisma({ suppression: false });
    const service = buildService(prisma);

    // @ts-expect-error -- private method under test
    const result = await service.suppressedContributorIds();

    expect(result.size).toBe(0);
    expect((prisma as never as { vdclAgreement: { findMany: jest.Mock } }).vdclAgreement.findMany)
      .not.toHaveBeenCalled();
  });

  it('collects contributors holding an active licence when the gate is on', async () => {
    const prisma = buildPrisma({
      suppression: true,
      agreements: [{ contributorId: 'signed-1' }, { contributorId: 'signed-2' }],
    });
    const service = buildService(prisma);

    // @ts-expect-error -- private method under test
    const result = await service.suppressedContributorIds();

    expect([...result]).toEqual(['signed-1', 'signed-2']);
  });

  it('asks only for non-withdrawn agreements on an ACTIVE version', async () => {
    // Matches RightsService: a withdrawn or suspended licence compensates
    // nobody, so those contributors must keep being paid in tokens.
    const prisma = buildPrisma({ suppression: true });
    const service = buildService(prisma);

    // @ts-expect-error -- private method under test
    await service.suppressedContributorIds();

    const args = (
      prisma as never as { vdclAgreement: { findMany: jest.Mock } }
    ).vdclAgreement.findMany.mock.calls[0][0];
    expect(args.where.withdrawnAt).toBeNull();
    expect(args.where.activeVersion).toEqual({ status: 'ACTIVE' });
  });
});
