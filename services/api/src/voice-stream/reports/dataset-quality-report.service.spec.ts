import { DatasetQualityReportService } from './dataset-quality-report.service';

function setup() {
  const prisma = {
    isvcCurrent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const catalogue = { matchingRecordingIdsForRule: jest.fn().mockResolvedValue([]) };
  const service = new DatasetQualityReportService(prisma as any, catalogue as any);
  return { prisma, catalogue, service };
}

describe('DatasetQualityReportService.build', () => {
  it('returns an empty-state report when no recordings are eligible', async () => {
    const { service } = setup();

    const report = await service.build();

    expect(report).toEqual({
      totalEligibleRecordings: 0,
      tierCounts: { standard: 0, high: 0, premium_verified: 0 },
      confidenceCounts: {},
      meanIsvs: null,
      meanAgreement: null,
      rows: [],
    });
  });

  it('buckets recordings into quality tiers and computes mean isvs/agreement', async () => {
    const { prisma, catalogue, service } = setup();
    catalogue.matchingRecordingIdsForRule.mockResolvedValue(['rec-1', 'rec-2', 'rec-3']);
    prisma.isvcCurrent.findMany.mockResolvedValue([
      {
        recordingId: 'rec-1',
        aggregation: { isvs: 96, agreement: 90, confidence: 'VERY_HIGH', organizationCount: 4 },
      },
      {
        recordingId: 'rec-2',
        aggregation: { isvs: 80, agreement: 70, confidence: 'HIGH', organizationCount: 2 },
      },
      // rec-3 has no current ISVC yet
    ]);

    const report = await service.build();

    expect(report.totalEligibleRecordings).toBe(3);
    expect(report.tierCounts).toEqual({ standard: 1, high: 1, premium_verified: 1 });
    expect(report.meanIsvs).toBe(88);
    expect(report.meanAgreement).toBe(80);
    expect(report.rows).toHaveLength(3);
  });
});
