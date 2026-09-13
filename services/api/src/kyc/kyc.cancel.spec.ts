import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KycService } from './kyc.service';

function setup() {
  const prisma = {
    kycVerification: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const didit = { createSession: jest.fn() };
  const selfHosted = {};
  const settings = { getActiveKycProvider: jest.fn().mockResolvedValue('didit') };
  const mail = {};
  const service = new KycService(
    prisma as never,
    didit as never,
    selfHosted as never,
    settings as never,
    mail as never,
  );
  return { service, prisma, didit };
}

describe('KycService.createVerificationSession', () => {
  it('resets an existing row back to IN_PROGRESS when Didit replays a session_id from a since-cancelled attempt', async () => {
    const { service, prisma, didit } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ kycStatus: 'ABANDONED' });
    didit.createSession.mockResolvedValue({ sessionId: 'sess-1', url: 'https://verify.didit.me/sess-1' });

    await service.createVerificationSession('user-1', 'https://app/callback');

    expect(prisma.kycVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerSessionId: 'sess-1' },
        update: { status: 'IN_PROGRESS', declineReason: null },
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { kycStatus: 'IN_PROGRESS' },
    });
  });

  it('rejects when the user is already APPROVED', async () => {
    const { service, prisma, didit } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ kycStatus: 'APPROVED' });

    await expect(
      service.createVerificationSession('user-1', 'https://app/callback'),
    ).rejects.toThrow(BadRequestException);
    expect(didit.createSession).not.toHaveBeenCalled();
  });
});

describe('KycService.cancelMyVerification', () => {
  it('throws NotFoundException when neither the verification row nor User.kycStatus is active', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ kycStatus: 'ABANDONED' });

    await expect(service.cancelMyVerification('user-1')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falls back to resetting User.kycStatus when no matching row exists but the user is still marked non-terminal', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ kycStatus: 'IN_REVIEW' });

    const result = await service.cancelMyVerification('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { kycStatus: 'ABANDONED' },
    });
    expect(result).toEqual({ cancelled: true });
  });

  it('abandons the most recent non-terminal verification and resets User.kycStatus', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findFirst.mockResolvedValue({ id: 'kyc-1', userId: 'user-1' });

    const result = await service.cancelMyVerification('user-1');

    expect(prisma.kycVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW'] } },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.kycVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'kyc-1' },
        data: expect.objectContaining({ status: 'ABANDONED' }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { kycStatus: 'ABANDONED' },
      }),
    );
    expect(result).toEqual({ cancelled: true });
  });
});

describe('KycService.adminCancel', () => {
  it('throws NotFoundException when the verification does not exist', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue(null);

    await expect(service.adminCancel('kyc-1')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the verification is already resolved', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({ id: 'kyc-1', status: 'APPROVED' });

    await expect(service.adminCancel('kyc-1')).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('abandons an in-review verification and returns the updated row', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      id: 'kyc-1',
      userId: 'user-1',
      status: 'IN_REVIEW',
    });
    prisma.kycVerification.findUniqueOrThrow.mockResolvedValue({
      id: 'kyc-1',
      status: 'ABANDONED',
    });

    const result = await service.adminCancel('kyc-1');

    expect(prisma.kycVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'kyc-1' },
        data: expect.objectContaining({ status: 'ABANDONED' }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { kycStatus: 'ABANDONED' },
      }),
    );
    expect(result).toEqual({ id: 'kyc-1', status: 'ABANDONED' });
  });
});
