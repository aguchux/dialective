import { ServiceUnavailableException } from '@nestjs/common';
import { SelfHostedKycService } from './self-hosted-kyc.service';

function setup() {
  const prisma = {
    kycVerification: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'v1',
        userId: 'u1',
        provider: 'self',
        status: 'IN_PROGRESS',
        selfieChallengeType: 'TURN_RIGHT',
      }),
    },
    kycCaptureEvidence: {
      findMany: jest.fn().mockResolvedValue([
        { kind: 'DOCUMENT_FRONT', bucket: 'kyc', key: 'front' },
        { kind: 'SELFIE_FRAME', bucket: 'kyc', key: 'frame1' },
        { kind: 'SELFIE_FRAME', bucket: 'kyc', key: 'frame2' },
      ]),
    },
  };
  const storage = { getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('test-image')) };
  const face = {
    detectSingleFace: jest.fn().mockResolvedValue({ descriptor: [1] }),
    scoreLiveness: jest
      .fn()
      .mockResolvedValue({ livenessScore: 80, bestFrameIndex: 0, poseCompliant: true }),
    compareDescriptors: jest.fn().mockResolvedValue(85),
  };
  const settings = {
    isSelfHostedKycBotEnabled: jest.fn().mockResolvedValue(false),
    isSelfHostedKycAutoApproveEnabled: jest.fn().mockResolvedValue(true),
    getSelfHostedKycApproveThresholds: jest
      .fn()
      .mockResolvedValue({ minFaceMatchScore: 85, minLivenessScore: 80 }),
    isSelfHostedKycDoNotAutoDeclineEnabled: jest.fn().mockResolvedValue(false),
  };
  const service = new SelfHostedKycService(
    prisma as never,
    storage as never,
    settings as never,
    {} as never,
    face as never,
  );
  return { service, face, settings };
}
describe('DLKYC submission evaluation', () => {
  it('approves a complete submission at both thresholds and records the policy', async () => {
    const { service } = setup();
    const decision = await service.evaluate('v1', 'u1');
    expect(decision.status).toBe('Approved');
    expect(decision.raw).toMatchObject({
      approvalSource: 'submission',
      thresholds: { minFaceMatchScore: 85, minLivenessScore: 80 },
      autoApproveEnabled: true,
    });
  });
  it('routes to manual review with the automatic gate off', async () => {
    const { service, settings } = setup();
    settings.isSelfHostedKycAutoApproveEnabled.mockResolvedValue(false);
    expect((await service.evaluate('v1', 'u1')).status).toBe('In Review');
  });
  it('recovers a transient model failure without generating a failed identity decision', async () => {
    const { service, face } = setup();
    face.detectSingleFace.mockRejectedValueOnce(new Error('model unavailable'));
    expect((await service.evaluate('v1', 'u1')).status).toBe('Approved');
    expect(face.detectSingleFace).toHaveBeenCalledTimes(3);
  });
  it('returns a retryable error after three technical failures', async () => {
    const { service, face } = setup();
    face.detectSingleFace.mockRejectedValue(new Error('model unavailable'));
    await expect(service.evaluate('v1', 'u1')).rejects.toThrow(ServiceUnavailableException);
    expect(face.detectSingleFace).toHaveBeenCalledTimes(3);
  });
  it('still treats a genuine missing face as a failed check', async () => {
    const { service, face } = setup();
    face.detectSingleFace.mockResolvedValue(null);
    expect((await service.evaluate('v1', 'u1')).status).toBe('Declined');
    expect(face.detectSingleFace).toHaveBeenCalledTimes(1);
  });
});
