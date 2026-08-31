import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KycService } from './kyc.service';

function setup() {
  const prisma = {
    kycVerification: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const didit = {};
  const settings = {};
  const service = new KycService(prisma as never, didit as never, settings as never);
  return { service, prisma };
}

describe('KycService.cancelMyVerification', () => {
  it('throws NotFoundException when the user has no active verification', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findFirst.mockResolvedValue(null);

    await expect(service.cancelMyVerification('user-1')).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
