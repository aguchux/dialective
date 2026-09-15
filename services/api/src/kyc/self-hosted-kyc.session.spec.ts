process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret';

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SelfHostedKycService } from './self-hosted-kyc.service';
import { signKycHandoffToken } from './self-hosted-kyc-handoff.util';

function setup(overrides?: { verification?: Record<string, unknown> }) {
  const verification = {
    id: 'v1',
    userId: 'u1',
    provider: 'self',
    status: 'IN_PROGRESS',
    selfieChallengeType: null as string | null,
    ...overrides?.verification,
  };
  const prisma = {
    kycVerification: {
      findUnique: jest.fn().mockResolvedValue(verification),
      update: jest.fn().mockResolvedValue(verification),
    },
  };
  const settings = {
    isSelfHostedKycEnabled: jest.fn().mockResolvedValue(true),
    getSelfHostedKycDocumentTypes: jest.fn().mockResolvedValue(['passport']),
  };
  const service = new SelfHostedKycService(
    prisma as never,
    {} as never,
    settings as never,
    {} as never,
    {} as never,
  );
  return { prisma, service, verification };
}

describe('SelfHostedKycService.getChallenge', () => {
  it('assigns and persists a challenge type the first time it is called', async () => {
    const { service, prisma, verification } = setup();
    const result = await service.getChallenge('v1', 'u1');

    expect(result.challenge).toBe('Turn your head slightly to the right');
    expect(prisma.kycVerification.update).toHaveBeenCalledWith({
      where: { id: verification.id },
      data: { selfieChallengeType: 'TURN_RIGHT' },
    });
  });

  it('returns the SAME challenge on a repeat call instead of re-rolling and re-writing it', async () => {
    // A refreshed page/retry hitting this endpoint twice must not risk
    // assigning the user a different challenge than the one already shown
    // to them client-side -- see kyc fix commit bb1e68f's getChallenge diff.
    const { service, prisma } = setup({ verification: { selfieChallengeType: 'TURN_RIGHT' } });

    const result = await service.getChallenge('v1', 'u1');

    expect(result.challenge).toBe('Turn your head slightly to the right');
    expect(prisma.kycVerification.update).not.toHaveBeenCalled();
  });

  it('rejects when the verification is not owned by the caller', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      id: 'v1',
      userId: 'someone-else',
      provider: 'self',
      status: 'IN_PROGRESS',
    });
    await expect(service.getChallenge('v1', 'u1')).rejects.toThrow(NotFoundException);
  });

  it('rejects when the verification is not IN_PROGRESS', async () => {
    const { service } = setup({ verification: { status: 'APPROVED' } });
    await expect(service.getChallenge('v1', 'u1')).rejects.toThrow();
  });
});

describe('SelfHostedKycService.resumeSession', () => {
  it('returns session details for a valid, owned, in-progress verification', async () => {
    const { service } = setup();
    const token = signKycHandoffToken({
      sub: 'u1',
      verificationId: 'v1',
      callbackUrl: 'https://dashboard.example.test/kyc/return',
    });

    const result = await service.resumeSession(token);

    expect(result.verificationId).toBe('v1');
    expect(result.callbackUrl).toBe('https://dashboard.example.test/kyc/return');
    expect(result.documentTypes).toEqual(['passport']);
  });

  it('rejects a malformed/expired token', async () => {
    const { service } = setup();
    await expect(service.resumeSession('not-a-real-token')).rejects.toThrow(ForbiddenException);
  });

  it('rejects a token whose subject does not own the verification', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      id: 'v1',
      userId: 'someone-else',
      status: 'IN_PROGRESS',
    });
    const token = signKycHandoffToken({
      sub: 'u1',
      verificationId: 'v1',
      callbackUrl: 'https://dashboard.example.test/kyc/return',
    });
    await expect(service.resumeSession(token)).rejects.toThrow(NotFoundException);
  });

  it('rejects resuming a verification that is no longer IN_PROGRESS', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue({
      id: 'v1',
      userId: 'u1',
      status: 'IN_REVIEW',
    });
    const token = signKycHandoffToken({
      sub: 'u1',
      verificationId: 'v1',
      callbackUrl: 'https://dashboard.example.test/kyc/return',
    });
    await expect(service.resumeSession(token)).rejects.toThrow(ConflictException);
  });

  it('rejects a token for a verification that no longer exists', async () => {
    const { service, prisma } = setup();
    prisma.kycVerification.findUnique.mockResolvedValue(null);
    const token = signKycHandoffToken({
      sub: 'u1',
      verificationId: 'missing',
      callbackUrl: 'https://dashboard.example.test/kyc/return',
    });
    await expect(service.resumeSession(token)).rejects.toThrow(NotFoundException);
  });
});
