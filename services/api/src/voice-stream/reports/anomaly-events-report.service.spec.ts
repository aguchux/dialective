import { AnomalyEventsReportService } from './anomaly-events-report.service';

function setup() {
  const prisma = { anomalyEvent: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new AnomalyEventsReportService(prisma as never);
  return { service, prisma };
}

describe('AnomalyEventsReportService.build', () => {
  it('returns an empty rows array when there are no anomalies', async () => {
    const { service } = setup();

    const report = await service.build('org-1');

    expect(report).toEqual({ rows: [] });
  });

  it('scopes to the organization, newest first', async () => {
    const { service, prisma } = setup();

    await service.build('org-1');

    expect(prisma.anomalyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
