import { IsvcConfidence, Prisma } from '@dialectiva/db';
import { IsvcService } from './isvc.service';

function setup() {
  const prisma = {
    subscriberValidation: { groupBy: jest.fn() },
    organizationValidationConsensus: { upsert: jest.fn(), findMany: jest.fn() },
    isvcCurrent: { findUnique: jest.fn(), upsert: jest.fn() },
    isvcAggregation: { create: jest.fn() },
    $transaction: undefined as unknown as jest.Mock,
  };
  prisma.$transaction = jest.fn(async (ops: unknown) => {
    if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)(prisma);
    return Promise.all(ops as Promise<unknown>[]);
  });
  const streams = { consume: jest.fn().mockResolvedValue(undefined) };
  const service = new IsvcService(streams as any, prisma as any);
  return { prisma, streams, service };
}

describe('IsvcService.recalculate', () => {
  it('is a no-op when no organization has validated the recording', async () => {
    const { prisma, service } = setup();
    prisma.subscriberValidation.groupBy.mockResolvedValue([]);
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([]);

    await service.recalculate('rec-1');

    expect(prisma.isvcAggregation.create).not.toHaveBeenCalled();
  });

  it('org-normalizes: two validators from the same org contribute one org-score, not two', async () => {
    const { prisma, service } = setup();
    // Two orgs validated; org-A has 2 validators averaging 90, org-B has 1
    // validator scoring 90 -- ISVS should be mean([90, 90]) = 90, not
    // influenced by org-A's extra validator (mean([90,90,90]) would still be
    // 90 here, so use an asymmetric case below to really prove it).
    prisma.subscriberValidation.groupBy.mockResolvedValue([
      { organizationId: 'org-A', _avg: { overallScore: 60 }, _count: { _all: 2 } },
      { organizationId: 'org-B', _avg: { overallScore: 90 }, _count: { _all: 1 } },
    ]);
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { meanScore: new Prisma.Decimal(60) },
      { meanScore: new Prisma.Decimal(90) },
    ]);
    prisma.isvcCurrent.findUnique.mockResolvedValue(null);
    prisma.isvcAggregation.create.mockResolvedValue({ id: 'agg-1' });

    await service.recalculate('rec-1');

    // If org-A's 2 validators were counted individually (naive per-validator
    // average of [60,60,90]), ISVS would be 70. Org-normalized, it's the
    // mean of the two ORG scores: mean([60, 90]) = 75.
    const createCall = prisma.isvcAggregation.create.mock.calls[0][0];
    expect(Number(createCall.data.isvs)).toBeCloseTo(75, 1);
    expect(createCall.data.organizationCount).toBe(2);
  });

  it('refreshes OrganizationValidationConsensus via upsert before aggregating', async () => {
    const { prisma, service } = setup();
    prisma.subscriberValidation.groupBy.mockResolvedValue([
      { organizationId: 'org-A', _avg: { overallScore: 88 }, _count: { _all: 3 } },
    ]);
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { meanScore: new Prisma.Decimal(88) },
    ]);
    prisma.isvcCurrent.findUnique.mockResolvedValue(null);
    prisma.isvcAggregation.create.mockResolvedValue({ id: 'agg-1' });

    await service.recalculate('rec-1');

    expect(prisma.organizationValidationConsensus.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_recordingId: { organizationId: 'org-A', recordingId: 'rec-1' } },
        update: expect.objectContaining({ validatorCount: 3 }),
      }),
    );
  });

  it('creates version 1 when no prior IsvcAggregation exists', async () => {
    const { prisma, service } = setup();
    prisma.subscriberValidation.groupBy.mockResolvedValue([
      { organizationId: 'org-A', _avg: { overallScore: 90 }, _count: { _all: 1 } },
      { organizationId: 'org-B', _avg: { overallScore: 90 }, _count: { _all: 1 } },
      { organizationId: 'org-C', _avg: { overallScore: 90 }, _count: { _all: 1 } },
    ]);
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { meanScore: new Prisma.Decimal(90) },
      { meanScore: new Prisma.Decimal(90) },
      { meanScore: new Prisma.Decimal(90) },
    ]);
    prisma.isvcCurrent.findUnique.mockResolvedValue(null);
    prisma.isvcAggregation.create.mockResolvedValue({ id: 'agg-1' });

    await service.recalculate('rec-1');

    expect(prisma.isvcAggregation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 1, recordingId: 'rec-1' }) }),
    );
    expect(prisma.isvcCurrent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recordingId: 'rec-1' },
        create: { recordingId: 'rec-1', aggregationId: 'agg-1' },
      }),
    );
  });

  it('does not create a new version when nothing materially changed', async () => {
    const { prisma, service } = setup();
    prisma.subscriberValidation.groupBy.mockResolvedValue([
      { organizationId: 'org-A', _avg: { overallScore: 90 }, _count: { _all: 1 } },
      { organizationId: 'org-B', _avg: { overallScore: 90 }, _count: { _all: 1 } },
      { organizationId: 'org-C', _avg: { overallScore: 90 }, _count: { _all: 1 } },
    ]);
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { meanScore: new Prisma.Decimal(90) },
      { meanScore: new Prisma.Decimal(90) },
      { meanScore: new Prisma.Decimal(90) },
    ]);
    prisma.isvcCurrent.findUnique.mockResolvedValue({
      recordingId: 'rec-1',
      aggregationId: 'agg-1',
      aggregation: {
        version: 1,
        isvs: new Prisma.Decimal(90),
        agreement: new Prisma.Decimal(100),
        confidence: IsvcConfidence.ESTABLISHED,
        organizationCount: 3,
        outlierOrgCount: 0,
      },
    });

    await service.recalculate('rec-1');

    expect(prisma.isvcAggregation.create).not.toHaveBeenCalled();
  });

  it('creates version 2 and repoints IsvcCurrent when the result materially changes', async () => {
    const { prisma, service } = setup();
    prisma.subscriberValidation.groupBy.mockResolvedValue([
      { organizationId: 'org-A', _avg: { overallScore: 40 }, _count: { _all: 1 } },
      { organizationId: 'org-B', _avg: { overallScore: 90 }, _count: { _all: 1 } },
      { organizationId: 'org-C', _avg: { overallScore: 90 }, _count: { _all: 1 } },
    ]);
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { meanScore: new Prisma.Decimal(40) },
      { meanScore: new Prisma.Decimal(90) },
      { meanScore: new Prisma.Decimal(90) },
    ]);
    prisma.isvcCurrent.findUnique.mockResolvedValue({
      recordingId: 'rec-1',
      aggregationId: 'agg-1',
      aggregation: {
        version: 1,
        isvs: new Prisma.Decimal(90),
        agreement: new Prisma.Decimal(100),
        confidence: IsvcConfidence.ESTABLISHED,
        organizationCount: 3,
        outlierOrgCount: 0,
      },
    });
    prisma.isvcAggregation.create.mockResolvedValue({ id: 'agg-2' });

    await service.recalculate('rec-1');

    expect(prisma.isvcAggregation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
    expect(prisma.isvcCurrent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recordingId: 'rec-1' },
        update: { aggregationId: 'agg-2' },
      }),
    );
  });
});
