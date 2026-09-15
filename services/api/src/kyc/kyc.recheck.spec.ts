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
