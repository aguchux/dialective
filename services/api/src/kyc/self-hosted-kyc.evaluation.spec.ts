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
    getSelfHostedKycBotProviderOrder: jest.fn().mockResolvedValue(['openai']),
  };
  const llm = {
    normalize: jest.fn().mockResolvedValue('{"plausibilityScore":90,"flags":[],"summary":"ok"}'),
    describeImage: jest
      .fn()
      .mockResolvedValue('{"plausibilityScore":90,"flags":[],"summary":"ok"}'),
  };
  const service = new SelfHostedKycService(
    prisma as never,
    storage as never,
    settings as never,
    llm as never,
    face as never,
  );
  return { service, face, settings, llm, storage };
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

  describe('bot plausibility check (selfHostedKycBotEnabled)', () => {
    it('sends the document image bytes to describeImage, not a blind text-only normalize() call', async () => {
      const { service, settings, llm } = setup();
      settings.isSelfHostedKycBotEnabled.mockResolvedValue(true);

      await service.evaluate('v1', 'u1');

      // Both OCR and the plausibility check must go through describeImage
      // (image-aware) -- normalize() (text-only, sees no image bytes) must
      // never be used for the plausibility check now that it can catch a
      // selfie submitted as the document photo.
      expect(llm.normalize).not.toHaveBeenCalled();
      expect(llm.describeImage).toHaveBeenCalledTimes(2);
      for (const call of llm.describeImage.mock.calls) {
        const [imageBase64, mimeType] = call;
        expect(typeof imageBase64).toBe('string');
        expect(imageBase64.length).toBeGreaterThan(0);
        expect(mimeType).toBe('image/jpeg');
      }
    });

    it('routes to review when the bot flags a selfie submitted as the document photo, even though face-match/liveness both clear the approve thresholds', async () => {
      const { service, settings, llm } = setup();
      settings.isSelfHostedKycBotEnabled.mockResolvedValue(true);
      llm.describeImage.mockResolvedValueOnce('{"fullName":null,"dateOfBirth":null,"documentNumber":null}');
      llm.describeImage.mockResolvedValueOnce(
        '{"plausibilityScore":10,"flags":["no_document_detected_appears_to_be_a_selfie"],"summary":"Looks like a selfie, not an ID"}',
      );

      const decision = await service.evaluate('v1', 'u1');

      expect(decision.status).toBe('In Review');
      expect((decision.raw as { botFindings?: { flags: string[] } }).botFindings?.flags).toContain(
        'no_document_detected_appears_to_be_a_selfie',
      );
    });

    it('falls back to no findings (never throws) when the bot check itself fails', async () => {
      const { service, settings, llm } = setup();
      settings.isSelfHostedKycBotEnabled.mockResolvedValue(true);
      llm.describeImage.mockRejectedValue(new Error('provider unavailable'));

      const decision = await service.evaluate('v1', 'u1');

      // A bot-layer failure is best-effort -- it must never block the rest
      // of evaluate() (the deterministic face-match/liveness checks still
      // ran and this submission still clears both approve thresholds).
      expect(decision.status).toBe('Approved');
    });
  });
});
