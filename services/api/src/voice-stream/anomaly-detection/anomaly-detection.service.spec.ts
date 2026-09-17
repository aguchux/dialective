import { AnomalyDetectionService } from './anomaly-detection.service';

function setup() {
  const prisma = {
    streamAccessLog: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    anomalyEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    subscriberOrganization: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme' }),
    },
    subscriberMembership: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const mail = { sendAnomalyAlertEmail: jest.fn().mockResolvedValue(undefined) };
  const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
  const service = new AnomalyDetectionService(
    prisma as never,
    mail as never,
    webhookEvents as never,
  );
  return { service, prisma, mail, webhookEvents };
}

describe('AnomalyDetectionService.runHourlyCheck', () => {
  it('does nothing when no organization had activity in the window', async () => {
    const { service, prisma } = setup();

    await service.runHourlyCheck();

    expect(prisma.streamAccessLog.count).not.toHaveBeenCalled();
    expect(prisma.anomalyEvent.create).not.toHaveBeenCalled();
  });

  it('does not flag denial_rate_spike below the minimum request floor', async () => {
    const { service, prisma } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([{ organizationId: 'org-1' }]);
    // Uniform low volume in both the current window and the baseline lookback
    // keeps the volume-spike rule from firing too, isolating this test to
    // the denial-rate rule's own request-count floor.
    prisma.streamAccessLog.count.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.entitlementDecision ? 2 : 3),
    );

    await service.runHourlyCheck();

    expect(prisma.anomalyEvent.create).not.toHaveBeenCalled();
  });

  it('flags denial_rate_spike when the denial rate exceeds the threshold above the request floor', async () => {
    const { service, prisma, mail, webhookEvents } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([{ organizationId: 'org-1' }]);
    prisma.streamAccessLog.count.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.entitlementDecision ? 15 : 20),
    );
    prisma.subscriberMembership.findMany.mockResolvedValue([{ user: { email: 'admin@acme.com' } }]);

    await service.runHourlyCheck();

    expect(prisma.anomalyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1', ruleKey: 'denial_rate_spike' }),
      }),
    );
    expect(mail.sendAnomalyAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'admin@acme.com', ruleKey: 'denial_rate_spike' }),
    );
    expect(webhookEvents.emit).toHaveBeenCalledWith(
      'org-1',
      'ANOMALY_DETECTED',
      expect.objectContaining({ rule_key: 'denial_rate_spike' }),
    );
  });

  it('does not re-fire the same rule for the same org+window twice (dedup)', async () => {
    const { service, prisma, mail } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([{ organizationId: 'org-1' }]);
    prisma.streamAccessLog.count.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.entitlementDecision ? 15 : 20),
    );
    prisma.anomalyEvent.findFirst.mockResolvedValue({ id: 'existing-event' });

    await service.runHourlyCheck();

    expect(prisma.anomalyEvent.create).not.toHaveBeenCalled();
    expect(mail.sendAnomalyAlertEmail).not.toHaveBeenCalled();
  });

  it('flags new_ip_burst when new-IP count in the window exceeds the threshold', async () => {
    const { service, prisma } = setup();
    prisma.streamAccessLog.groupBy.mockResolvedValue([{ organizationId: 'org-1' }]);
    prisma.streamAccessLog.count.mockResolvedValue(0);
    const newIps = Array.from({ length: 11 }, (_, i) => ({ ipAddress: `10.0.0.${i}` }));
    prisma.streamAccessLog.findMany.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        const gte = (where.createdAt as { gte: Date }).gte;
        const isRecentWindow = gte.getTime() > Date.now() - 2 * 60 * 60 * 1000;
        return Promise.resolve(isRecentWindow ? newIps : []);
      },
    );

    await service.runHourlyCheck();

    expect(prisma.anomalyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleKey: 'new_ip_burst' }) }),
    );
  });
});
