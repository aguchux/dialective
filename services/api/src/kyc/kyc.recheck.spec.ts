import { KycService } from './kyc.service';
import { encryptKycField } from '../common/kyc-crypto.util';

function setup() {
  process.env.KYC_DOCUMENT_ENCRYPTION_KEY ??= 'test-recheck-key';
  const row = {
    id: 'v1',
    userId: 'u1',
    status: 'IN_REVIEW',
    faceMatchScore: { toNumber: () => 90 },
    livenessScore: { toNumber: () => 90 },
    decisionEncryptedJson: encryptKycField(
      JSON.stringify({ provider: 'self', band: 'REVIEW', botFindings: null }),
    ),
  };
  const tx = {
    kycVerification: {
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ kycStatus: 'IN_REVIEW' }),
      update: jest.fn(),
    },
  };
  const prisma = {
    kycVerification: { findMany: jest.fn().mockResolvedValue([row]) },
    kycRecheckRun: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fn) => fn(tx)),
  };
  const settings = {
    isSelfHostedKycAutoApproveEnabled: jest.fn().mockResolvedValue(true),
    getSelfHostedKycApproveThresholds: jest
      .fn()
      .mockResolvedValue({ minFaceMatchScore: 85, minLivenessScore: 80 }),
  };
  return {
    row,
    tx,
    prisma,
    settings,
    service: new KycService(
      prisma as never,
      {} as never,
      {} as never,
      settings as never,
      {} as never,
    ),
  };
}
describe('DLKYC backlog rechecks', () => {
  it('does not update an account if another worker already claimed the verification', async () => {
    const { service, tx } = setup();
    tx.kycVerification.updateMany.mockResolvedValue({ count: 0 });
    expect((await service.recheckSelfHosted(false)).approved).toBe(0);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('does not override changed evidence or a manual decision', async () => {
    const { service, tx, row } = setup();
    tx.kycVerification.findFirst.mockResolvedValue({
      ...row,
      decisionEncryptedJson: encryptKycField(
        JSON.stringify({ provider: 'self', adminOverride: 'decline' }),
      ),
    });
    expect((await service.recheckSelfHosted(false)).approved).toBe(0);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('defers transaction conflicts for the next scheduled pass', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue(new Error('serialization conflict'));
    expect(await service.recheckSelfHosted(false)).toMatchObject({ approved: 0, errors: 1 });
  });
  it('honours the admin gate', async () => {
    const { service, settings, prisma } = setup();
    settings.isSelfHostedKycAutoApproveEnabled.mockResolvedValue(false);
    expect((await service.recheckSelfHosted(false)).approved).toBe(0);
    expect(prisma.kycVerification.findMany).not.toHaveBeenCalled();
  });
  it('previews without writing', async () => {
    const { service, tx } = setup();
    expect((await service.recheckSelfHosted()).eligible).toBe(1);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('atomically approves the verification and account', async () => {
    const { service, tx } = setup();
    expect((await service.recheckSelfHosted(false)).approved).toBe(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { kycStatus: 'APPROVED', kycVerifiedAt: expect.any(Date) },
    });
  });
  it.each(['APPROVED', 'DECLINED', 'ABANDONED'])(
    'respects a concurrent %s decision',
    async (status) => {
      const { service, tx, row } = setup();
      tx.kycVerification.findFirst.mockResolvedValue({ ...row, status });
      expect((await service.recheckSelfHosted(false)).approved).toBe(0);
      expect(tx.user.update).not.toHaveBeenCalled();
    },
  );
  it('does not approve superseded attempts', async () => {
    const { service, tx, row } = setup();
    tx.kycVerification.findFirst.mockResolvedValue({ ...row, id: 'newer' });
    expect((await service.recheckSelfHosted(false)).approved).toBe(0);
  });
  it('defers unreadable evidence without approving', async () => {
    const { service, row, tx } = setup();
    row.decisionEncryptedJson.authTag = 'invalid';
    expect((await service.recheckSelfHosted(false)).errors).toBe(1);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('DLKYC recheck run tracking', () => {
  it('recheckRun persists a MANUAL KycRecheckRun row with the scan result', async () => {
    const { service, prisma } = setup();

    const result = await service.recheckRun();

    expect(result.approved).toBe(1);
    expect(prisma.kycRecheckRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trigger: 'MANUAL',
        enabled: true,
        scanned: 1,
        eligible: 1,
        approved: 1,
        skipped: 0,
        errors: 0,
      }),
    });
  });

  it('recheckScheduled (the cron) persists a SCHEDULED KycRecheckRun row', async () => {
    const { service, prisma } = setup();

    await service.recheckScheduled();

    expect(prisma.kycRecheckRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ trigger: 'SCHEDULED', enabled: true }),
    });
  });

  it('still records a run row (enabled: false, zero counts) when auto-approve is off, so the cron firing is visible even when it has nothing to do', async () => {
    const { service, prisma, settings } = setup();
    settings.isSelfHostedKycAutoApproveEnabled.mockResolvedValue(false);

    await service.recheckScheduled();

    expect(prisma.kycRecheckRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ trigger: 'SCHEDULED', enabled: false, scanned: 0 }),
    });
  });

  it('records a failed run with errorMessage (not the per-row scan result) when the scan itself throws, and still surfaces the error to the caller', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findMany.mockRejectedValue(new Error('db unreachable'));

    await expect(service.recheckRun()).rejects.toThrow('db unreachable');

    expect(prisma.kycRecheckRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        trigger: 'MANUAL',
        enabled: false,
        errorMessage: expect.stringContaining('db unreachable'),
      }),
    });
  });

  it('preview calls (recheckSelfHosted directly) never write a KycRecheckRun row', async () => {
    const { service, prisma } = setup();

    await service.recheckSelfHosted(true);

    expect(prisma.kycRecheckRun.create).not.toHaveBeenCalled();
  });

  it('listRecheckRuns returns the most recent runs, newest first, capped at 100', async () => {
    const { service, prisma } = setup();
    prisma.kycRecheckRun.findMany.mockResolvedValue([{ id: 'run-1' }]);

    const result = await service.listRecheckRuns(500);

    expect(result).toEqual([{ id: 'run-1' }]);
    expect(prisma.kycRecheckRun.findMany).toHaveBeenCalledWith({
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  });
});
