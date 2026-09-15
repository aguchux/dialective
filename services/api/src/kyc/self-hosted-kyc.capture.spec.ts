import { BadRequestException } from '@nestjs/common';
import { SelfHostedKycService } from './self-hosted-kyc.service';

const JPEG = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
const DOCUMENT_KEY = 'self/u1/v1/document/front.jpg';
const SELFIE_KEYS = [
  'self/u1/v1/selfie/frame-1.jpg',
  'self/u1/v1/selfie/frame-2.jpg',
  'self/u1/v1/selfie/frame-3.jpg',
];
const CHALLENGE = 'Turn your head slightly to the right';

function setup() {
  const verification = {
    id: 'v1',
    userId: 'u1',
    provider: 'self',
    status: 'IN_PROGRESS',
    selfieChallengeType: 'TURN_RIGHT',
  };
  const transactionClient = {
    kycVerification: {
      findUnique: jest.fn().mockResolvedValue(verification),
      update: jest.fn().mockResolvedValue(verification),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kycCaptureEvidence: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    ...transactionClient,
    $transaction: jest.fn(
      (operation: ((tx: typeof transactionClient) => Promise<unknown>) | Promise<unknown>[]) =>
        typeof operation === 'function' ? operation(transactionClient) : Promise.all(operation),
    ),
  };
  const storage = {
    createPresignedUploadUrl: jest.fn().mockResolvedValue({
      url: 'https://upload.example.test',
      expiresInSeconds: 900,
    }),
    getObjectMetadata: jest.fn().mockResolvedValue({
      contentLength: JPEG.length,
      contentType: 'image/jpeg',
    }),
    getObjectBuffer: jest.fn().mockResolvedValue(JPEG),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    isSelfHostedKycEnabled: jest.fn().mockResolvedValue(true),
    getSelfHostedKycDocumentTypes: jest.fn().mockResolvedValue(['passport']),
  };
  const service = new SelfHostedKycService(
    prisma as never,
    storage as never,
    settings as never,
    {} as never,
    {} as never,
  );
  return { prisma, service, storage, verification };
}

describe('DLKYC evidence capture security', () => {
  it('generates stage-bound JPEG upload keys', async () => {
    const { service, storage } = setup();

    const result = await service.createEvidenceUploadUrl('v1', 'u1', 'image/jpeg', 'document');

    expect(result.key).toMatch(/^self\/u1\/v1\/document\/[0-9a-f-]+\.jpg$/);
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(
      'dialectiva-kyc-evidence',
      result.key,
      'image/jpeg',
    );
  });

  it('rejects non-JPEG upload requests', async () => {
    const { service, storage } = setup();

    await expect(
      service.createEvidenceUploadUrl('v1', 'u1', 'image/png', 'document'),
    ).rejects.toThrow(BadRequestException);
    expect(storage.createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects an object key from another session before reading storage', async () => {
    const { service, storage } = setup();

    await expect(
      service.submitDocument('v1', 'u1', {
        documentType: 'passport',
        frontKey: 'self/u2/v2/document/stolen.jpg',
      }),
    ).rejects.toThrow('does not belong');
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();
  });

  it('rejects missing, oversized, mislabeled, and invalid JPEG evidence', async () => {
    const { service, storage } = setup();
    storage.getObjectMetadata.mockRejectedValueOnce(new Error('not found'));
    await expect(
      service.submitDocument('v1', 'u1', {
        documentType: 'passport',
        frontKey: DOCUMENT_KEY,
      }),
    ).rejects.toThrow('was not found');

    storage.getObjectMetadata.mockResolvedValueOnce({
      contentLength: 9 * 1024 * 1024,
      contentType: 'image/jpeg',
    });
    await expect(
      service.submitDocument('v1', 'u1', {
        documentType: 'passport',
        frontKey: DOCUMENT_KEY,
      }),
    ).rejects.toThrow('no larger than 8 MB');

    storage.getObjectMetadata.mockResolvedValueOnce({
      contentLength: JPEG.length,
      contentType: 'image/png',
    });
    await expect(
      service.submitDocument('v1', 'u1', {
        documentType: 'passport',
        frontKey: DOCUMENT_KEY,
      }),
    ).rejects.toThrow('must be a JPEG');

    storage.getObjectMetadata.mockResolvedValueOnce({
      contentLength: 6,
      contentType: 'image/jpeg',
    });
    storage.getObjectBuffer.mockResolvedValueOnce(Buffer.from('notjpg'));
    await expect(
      service.submitDocument('v1', 'u1', {
        documentType: 'passport',
        frontKey: DOCUMENT_KEY,
      }),
    ).rejects.toThrow('not a valid JPEG');
  });

  it('atomically replaces an earlier document capture and removes its object', async () => {
    const { prisma, service, storage } = setup();
    prisma.kycCaptureEvidence.findMany.mockResolvedValue([
      { bucket: 'dialectiva-kyc-evidence', key: 'self/u1/v1/document/old.jpg' },
    ]);

    await service.submitDocument('v1', 'u1', {
      documentType: 'passport',
      frontKey: DOCUMENT_KEY,
    });

    expect(prisma.kycCaptureEvidence.deleteMany).toHaveBeenCalled();
    expect(prisma.kycCaptureEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ key: DOCUMENT_KEY, kind: 'DOCUMENT_FRONT' }),
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'dialectiva-kyc-evidence',
      'self/u1/v1/document/old.jpg',
    );
  });

  it('rejects a mismatched or missing selfie challenge', async () => {
    const { service, storage, verification } = setup();

    await expect(
      service.submitSelfie('v1', 'u1', {
        frameKeys: SELFIE_KEYS,
        challenge: 'Turn your head left',
      }),
    ).rejects.toThrow('does not match');
    expect(storage.getObjectMetadata).not.toHaveBeenCalled();

    verification.selfieChallengeType = null as never;
    await expect(
      service.submitSelfie('v1', 'u1', { frameKeys: SELFIE_KEYS, challenge: CHALLENGE }),
    ).rejects.toThrow('does not match');
  });

  it('rejects repeated selfie object keys', async () => {
    const { service } = setup();

    await expect(
      service.submitSelfie('v1', 'u1', {
        frameKeys: [SELFIE_KEYS[0], SELFIE_KEYS[0]],
        challenge: CHALLENGE,
      }),
    ).rejects.toThrow('distinct uploads');
  });

  it('rejects a document write if the session was cancelled after validation', async () => {
    const { prisma, service } = setup();
    prisma.kycVerification.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.submitDocument('v1', 'u1', {
        documentType: 'passport',
        frontKey: DOCUMENT_KEY,
      }),
    ).rejects.toThrow('no longer active');
    expect(prisma.kycCaptureEvidence.create).not.toHaveBeenCalled();
  });

  it('rejects a selfie write if the session was cancelled after validation', async () => {
    const { prisma, service } = setup();
    prisma.kycVerification.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.submitSelfie('v1', 'u1', {
        frameKeys: SELFIE_KEYS,
        challenge: CHALLENGE,
      }),
    ).rejects.toThrow('no longer active');
    expect(prisma.kycCaptureEvidence.createMany).not.toHaveBeenCalled();
  });

  it('reuses an already-issued challenge and replaces selfie evidence', async () => {
    const { prisma, service, storage } = setup();
    expect(await service.getChallenge('v1', 'u1')).toEqual({ challenge: CHALLENGE });
    expect(prisma.kycVerification.update).not.toHaveBeenCalled();

    prisma.kycCaptureEvidence.findMany.mockResolvedValue([
      { bucket: 'dialectiva-kyc-evidence', key: 'self/u1/v1/selfie/old.jpg' },
    ]);
    await service.submitSelfie('v1', 'u1', {
      frameKeys: SELFIE_KEYS,
      challenge: CHALLENGE,
    });

    expect(prisma.kycCaptureEvidence.deleteMany).toHaveBeenCalled();
    expect(prisma.kycCaptureEvidence.createMany).toHaveBeenCalledWith({
      data: SELFIE_KEYS.map((key) => ({
        kycVerificationId: 'v1',
        kind: 'SELFIE_FRAME',
        bucket: 'dialectiva-kyc-evidence',
        key,
      })),
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'dialectiva-kyc-evidence',
      'self/u1/v1/selfie/old.jpg',
    );
  });
});
