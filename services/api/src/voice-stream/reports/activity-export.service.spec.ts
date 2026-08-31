import { ActivityExportService } from './activity-export.service';

function setup() {
  const prisma = { orgActivityEvent: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new ActivityExportService(prisma as never);
  return { service, prisma };
}

describe('ActivityExportService.build', () => {
  it('returns an empty rows array when there is no activity', async () => {
    const { service } = setup();

    const report = await service.build('org-1', {});

    expect(report).toEqual({ rows: [] });
  });

  it('applies eventType and date-range filters', async () => {
    const { service, prisma } = setup();
    const from = new Date('2026-01-01');

    await service.build('org-1', { eventType: 'KEY_CREATED' as never, from });

    expect(prisma.orgActivityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          eventType: 'KEY_CREATED',
          createdAt: { gte: from },
        }),
      }),
    );
  });
});
