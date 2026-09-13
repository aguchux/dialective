import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KycService } from './kyc.service';

// applyDecision (invoked by adminRevokeVerification) encrypts the raw
// decision payload via kyc-crypto.util, which requires this at import time.
beforeAll(() => {
  process.env.KYC_DOCUMENT_ENCRYPTION_KEY ??= 'test-only-passphrase-not-used-in-prod';
});

function setup() {
  const kycVerification = {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  };
  const user = {
    update: jest.fn(),
    findUnique: jest.fn().mockResolvedValue({
      email: 'trainer@example.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
      smsNotificationsEnabled: false,
    }),
  };
  const prisma = {
    kycVerification,
    user,
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ kycVerification, user })),
  };
  const didit = {};
  const selfHosted = {};
  const settings = {};
  const mail = { sendKycDeclinedEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new KycService(
    prisma as never,
    didit as never,
    selfHosted as never,
    settings as never,
    mail as never,
  );
  return { service, prisma, mail };
}

describe('KycService.adminRevokeVerification', () => {
  it('throws NotFoundException when the verification does not exist', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue(null);

    await expect(service.adminRevokeVerification('missing', 'fraud')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a verification that is not APPROVED', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      id: 'v1',
      userId: 'user-1',
      status: 'IN_REVIEW',
      provider: 'self',
      faceMatchScore: null,
      livenessScore: null,
    });

    await expect(service.adminRevokeVerification('v1', 'fraud')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('flips an APPROVED verification (either provider) back to DECLINED and clears the identity fingerprint', async () => {
    const { service, prisma, mail } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      id: 'v1',
      userId: 'user-1',
      status: 'APPROVED',
      provider: 'didit',
      faceMatchScore: null,
      livenessScore: null,
    });
    prisma.kycVerification.findUniqueOrThrow.mockResolvedValue({ id: 'v1', status: 'DECLINED' });

    await service.adminRevokeVerification('v1', 'Fraud discovered after approval');

    expect(prisma.kycVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: expect.objectContaining({
          status: 'DECLINED',
          declineReason: 'Fraud discovered after approval',
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ kycStatus: 'DECLINED' }),
      }),
    );
    // Second, separate user.update call clears the duplicate-identity fingerprint
    // so the user isn't permanently blocked from ever re-verifying.
    expect(prisma.user.update).toHaveBeenLastCalledWith({
      where: { id: 'user-1' },
      data: { diditIdentityFingerprint: null },
    });
    expect(mail.sendKycDeclinedEmail).toHaveBeenCalledWith({
      trainerEmail: 'trainer@example.com',
      reason: 'Fraud discovered after approval',
    });
  });
});
