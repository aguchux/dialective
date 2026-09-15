import { KycService } from './kyc.service';

function setup(settingsOverrides: { enabled?: boolean; minutes?: number } = {}) {
  const prisma = {
    kycVerification: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const didit = {};
  const selfHosted = {};
  const settings = {
    getKycAutoCancelStaleSettings: jest.fn().mockResolvedValue({
      enabled: settingsOverrides.enabled ?? true,
      minutes: settingsOverrides.minutes ?? 60,
    }),
  };
  const mail = {};
  const service = new KycService(
    prisma as never,
    didit as never,
    selfHosted as never,
    settings as never,
    mail as never,
  );
  return { service, prisma, settings };
}

describe('KycService.autoCancelStaleVerifications', () => {
  it('does not overwrite an approval that arrived after the stale scan', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findMany.mockResolvedValue([{ id: 'v1', userId: 'u1' }]);
    prisma.kycVerification.updateMany.mockResolvedValue({ count: 0 });
    await service.autoCancelStaleVerifications();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('excludes completed DLKYC reviews from stale cancellation', async () => {
    const { service, prisma } = setup();
    await service.autoCancelStaleVerifications();
    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ NOT: { provider: 'self', status: 'IN_REVIEW' } }),
      }),
    );
  });
  it('does nothing when kycAutoCancelStaleEnabled is off', async () => {
    const { service, prisma } = setup({ enabled: false });

    await service.autoCancelStaleVerifications();

    expect(prisma.kycVerification.findMany).not.toHaveBeenCalled();
  });

  it('abandons a stale verification and the user status when no other active attempt exists', async () => {
    const { service, prisma } = setup({ minutes: 60 });
    prisma.kycVerification.findMany.mockResolvedValue([{ id: 'kyc-1', userId: 'user-1' }]);
    prisma.kycVerification.findFirst.mockResolvedValue(null); // no fresher active attempt

    await service.autoCancelStaleVerifications();

    expect(prisma.kycVerification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'kyc-1' }),
        data: expect.objectContaining({ status: 'ABANDONED' }),
      }),
    );
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'user-1' }),
      data: { kycStatus: 'ABANDONED' },
    });
  });

  it('marks the stale row ABANDONED but leaves User.kycStatus alone when a fresher attempt is still active', async () => {
    const { service, prisma } = setup({ minutes: 60 });
    prisma.kycVerification.findMany.mockResolvedValue([{ id: 'kyc-old', userId: 'user-1' }]);
    prisma.kycVerification.findFirst.mockResolvedValue({ id: 'kyc-new' }); // fresher attempt in flight

    await service.autoCancelStaleVerifications();

    expect(prisma.kycVerification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'kyc-old' }) }),
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('queries only non-terminal statuses older than the configured timeout', async () => {
    const { service, prisma } = setup({ minutes: 45 });

    await service.autoCancelStaleVerifications();

    expect(prisma.kycVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW'] },
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('no-ops when nothing is stale', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findMany.mockResolvedValue([]);

    await service.autoCancelStaleVerifications();

    expect(prisma.kycVerification.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});
