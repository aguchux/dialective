import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KycService } from './kyc.service';
import { decryptKycField } from '../common/kyc-crypto.util';

function setup() {
  process.env.KYC_DOCUMENT_ENCRYPTION_KEY ??= 'test-only-manual-approval';
  const row = {
    id: 'v1',
    userId: 'u1',
    provider: 'self',
    status: 'IN_REVIEW',
    faceMatchScore: { toNumber: () => 20 },
    livenessScore: { toNumber: () => 25 },
  };
  const kycVerification = {
    findUnique: jest.fn().mockResolvedValue(row),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ ...row, status: 'APPROVED' }),
    update: jest.fn().mockResolvedValue({}),
  };
  const user = {
    update: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue({ email: 'trainer@example.com', phoneNumber: null }),
  };
  const prisma = {
    kycVerification,
    user,
    $transaction: jest.fn((fn) => fn({ kycVerification, user })),
  };
  const settings = {
    isSelfHostedKycAutoApproveEnabled: jest.fn().mockResolvedValue(false),
    getSelfHostedKycThresholds: jest.fn().mockResolvedValue({
      minFaceMatchScore: 99,
      minLivenessScore: 99,
      maxFaceMatchScoreForDecline: 40,
      maxLivenessScoreForDecline: 40,
      requireDocumentFaceDetected: true,
    }),
  };
  const mail = { sendKycDeclinedEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new KycService(
    prisma as never,
    {} as never,
    {} as never,
    settings as never,
    mail as never,
  );
  return { row, prisma, settings, mail, service };
}

describe('DLKYC manual oversight', () => {
  it('allows manual approval below thresholds while automatic approval is disabled', async () => {
    const { service, prisma, settings } = setup();
    await expect(service.adminApproveSelfHosted('v1')).resolves.toMatchObject({
      status: 'APPROVED',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { kycStatus: 'APPROVED', kycVerifiedAt: expect.any(Date) },
    });
    expect(prisma.kycVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          faceMatchScore: 20,
          livenessScore: 25,
        }),
      }),
    );
    expect(settings.isSelfHostedKycAutoApproveEnabled).not.toHaveBeenCalled();
    const saved = prisma.kycVerification.update.mock.calls[0][0].data.decisionEncryptedJson;
    expect(JSON.parse(decryptKycField(saved))).toEqual({
      provider: 'self',
      adminOverride: 'approve',
    });
  });

  it('allows human oversight when automated scores are unavailable', async () => {
    const { service, prisma, row } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      ...row,
      faceMatchScore: null,
      livenessScore: null,
    });
    await service.adminApproveSelfHosted('v1');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it.each(['APPROVED', 'DECLINED', 'ABANDONED', 'EXPIRED'])(
    'rejects a resolved %s case',
    async (status) => {
      const { service, prisma, row } = setup();
      prisma.kycVerification.findUnique.mockResolvedValue({ ...row, status });
      await expect(service.adminApproveSelfHosted('v1')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('does not override Didit provider decisions', async () => {
    const { service, prisma, row } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({ ...row, provider: 'didit' });
    await expect(service.adminApproveSelfHosted('v1')).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects missing verifications', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue(null);
    await expect(service.adminApproveSelfHosted('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('keeps manual decline and its notification available', async () => {
    const { service, prisma, mail } = setup();
    await service.adminDeclineSelfHosted('v1', 'Document unreadable');
    expect(prisma.kycVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DECLINED', declineReason: 'Document unreadable' }),
      }),
    );
    expect(mail.sendKycDeclinedEmail).toHaveBeenCalledWith({
      trainerEmail: 'trainer@example.com',
      reason: 'Document unreadable',
    });
  });
});
