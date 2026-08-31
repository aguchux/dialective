import { ValidationContributionReportService } from './validation-contribution-report.service';

function setup() {
  const prisma = {
    organizationValidationConsensus: { findMany: jest.fn().mockResolvedValue([]) },
    wordRecording: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ValidationContributionReportService(prisma as any);
  return { prisma, service };
}

describe('ValidationContributionReportService.build', () => {
  it('returns an empty-state report for an org with no validation contributions', async () => {
    const { service } = setup();

    const report = await service.build('org-1');

    expect(report).toEqual({
      totalRecordingsValidated: 0,
      averageValidatorCount: null,
      averageMeanScore: null,
      byDialect: {},
      rows: [],
    });
  });

  it('averages validatorCount/meanScore and buckets by dialect', async () => {
    const { prisma, service } = setup();
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { recordingId: 'rec-1', validatorCount: 3, meanScore: '90.00', updatedAt: new Date() },
      { recordingId: 'rec-2', validatorCount: 1, meanScore: '70.00', updatedAt: new Date() },
    ]);
    prisma.wordRecording.findMany.mockResolvedValue([
      { id: 'rec-1', dialectTag: 'igbo' },
      { id: 'rec-2', dialectTag: 'yoruba' },
    ]);

    const report = await service.build('org-1');

    expect(report.totalRecordingsValidated).toBe(2);
    expect(report.averageValidatorCount).toBe(2);
    expect(report.averageMeanScore).toBe(80);
    expect(report.byDialect).toEqual({ igbo: 1, yoruba: 1 });
  });

  it('falls back to "unknown" for a recording that no longer resolves (purged)', async () => {
    const { prisma, service } = setup();
    prisma.organizationValidationConsensus.findMany.mockResolvedValue([
      { recordingId: 'rec-purged', validatorCount: 2, meanScore: '85.00', updatedAt: new Date() },
    ]);
    prisma.wordRecording.findMany.mockResolvedValue([]);

    const report = await service.build('org-1');

    expect(report.byDialect).toEqual({ unknown: 1 });
  });
});
