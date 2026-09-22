import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, VdclVersionStatus } from '@dialectiva/db';
import { VdclSigningService } from './vdcl-signing.service';
import { vdclSigningContextHash } from './vdcl-signing-context.util';

/**
 * Signing is the moment a contributor becomes bound by a document. The
 * tests that matter most are the ones pinning WHAT they are bound to:
 * the step-up code is issued against a manifest hash and consumed against
 * the hash re-read at signing time, so a dataset that changed in between
 * cannot have a signature land on it.
 *
 * That is Phase 3's acceptance criterion -- "material changes require a new
 * signed version" -- enforced rather than documented.
 */
describe('VdclSigningService', () => {
  function makeService(opts: {
    version?: Record<string, unknown> | null;
    user?: Record<string, unknown>;
    signatureEvent?: Record<string, unknown> | null;
    claimCount?: number;
  } = {}) {
    const tx = {
      otpCode: { update: jest.fn().mockResolvedValue({}) },
      vdclVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'v1',
          status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
          signedAt: new Date('2026-09-22T10:00:00Z'),
          manifestHash: 'hash-abc',
        }),
      },
      vdclSignatureEvent: { create: jest.fn().mockResolvedValue({}) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      vdclVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.version === undefined ? defaultVersion() : opts.version),
      },
      vdclManifest: {
        findUnique: jest.fn().mockResolvedValue({
          manifestKey: 'VDM-NG-IGNG-USER0001-1',
          recordingCount: 12,
          totalDurationMs: 48000n,
          transcriptCount: 10,
          excludedCount: 2,
          meanCompositeScore: { toString: () => '81.00' },
          asrPipelineVersion: 'whisper',
          scoreDefinitions: {},
          compiledAt: new Date(),
        }),
      },
      vdclSignatureEvent: {
        findFirst: jest.fn().mockResolvedValue(
          opts.signatureEvent === undefined
            ? {
                createdAt: new Date('2026-09-22T10:00:00Z'),
                signatureKind: 'typed',
                stepUpMethod: 'otp_email',
              }
            : opts.signatureEvent,
        ),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(
          opts.user ?? { email: 'c@example.com', kycStatus: KycStatus.APPROVED, status: 'ACTIVE' },
        ),
      },
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const otp = {
      issueForUser: jest
        .fn()
        .mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
      verifyWithoutConsuming: jest.fn().mockResolvedValue({ id: 'otp-row-1' }),
    };
    return { service: new VdclSigningService(prisma as never, otp as never), prisma, otp, tx };
  }

  function defaultVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      agreementId: 'a1',
      status: VdclVersionStatus.PENDING_REVIEW,
      signedAt: null,
      countersignedAt: null,
      manifestHash: 'hash-abc',
      termsVersion: 'terms-1.0',
      agreement: {
        id: 'a1',
        contributorId: 'user-1',
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        dialectTag: 'ig-ng',
        withdrawnAt: null,
      },
      manifest: { id: 'm1', manifestKey: 'VDM-NG-IGNG-USER0001-1', recordingCount: 12 },
      grants: [{ purpose: 'ASR_TRAINING', wordingVersion: 'w1' }],
      ...overrides,
    };
  }

  const signArgs = {
    versionId: 'v1',
    contributorId: 'user-1',
    otpRequestId: 'otp-1',
    code: '123456',
    signatureKind: 'typed' as const,
  };

  describe('ownership', () => {
    it("refuses a version belonging to someone else, as NotFound rather than Forbidden", async () => {
      // A contributor probing ids must not learn that a version exists
      // under someone else's name.
      const { service } = makeService({
        version: defaultVersion({
          agreement: { ...defaultVersion().agreement, contributorId: 'someone-else' },
        }),
      });

      await expect(service.getForReview('v1', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(service.sign(signArgs)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound for an unknown version', async () => {
      const { service } = makeService({ version: null });
      await expect(service.sign(signArgs)).rejects.toThrow(NotFoundException);
    });
  });

  describe('binding the signature to what was reviewed', () => {
    it('binds the step-up code to the manifest hash and the granted purposes', async () => {
      const { service, otp } = makeService();

      await service.requestSigningOtp('v1', 'user-1');

      expect(otp.issueForUser).toHaveBeenCalledWith(
        'user-1',
        'VDCL_SIGN',
        'c@example.com',
        vdclSigningContextHash({
          versionId: 'v1',
          manifestHash: 'hash-abc',
          purposes: ['ASR_TRAINING'],
        }),
      );
    });

    it('verifies against the hash re-read at signing time, not one passed in', async () => {
      // This is the acceptance criterion. If the manifest changed after the
      // code was issued, the re-derived context differs and verification
      // fails closed.
      const { service, otp } = makeService();

      await service.sign(signArgs);

      expect(otp.verifyWithoutConsuming).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'VDCL_SIGN',
          userId: 'user-1',
          contextHash: vdclSigningContextHash({
            versionId: 'v1',
            manifestHash: 'hash-abc',
            purposes: ['ASR_TRAINING'],
          }),
        }),
      );
    });

    it('derives a different binding when the manifest changed', async () => {
      // Same version, different dataset -- so a code issued for the old one
      // cannot complete a signature on the new one.
      const before = vdclSigningContextHash({
        versionId: 'v1',
        manifestHash: 'hash-abc',
        purposes: ['ASR_TRAINING'],
      });
      const after = vdclSigningContextHash({
        versionId: 'v1',
        manifestHash: 'hash-CHANGED',
        purposes: ['ASR_TRAINING'],
      });
      expect(before).not.toBe(after);
    });

    it('derives a different binding when the granted purposes changed', async () => {
      // A contributor reviewing a licence granting ASR training only must
      // not have that code complete a signature on one that also grants
      // redistribution.
      const narrow = vdclSigningContextHash({
        versionId: 'v1',
        manifestHash: 'hash-abc',
        purposes: ['ASR_TRAINING'],
      });
      const broad = vdclSigningContextHash({
        versionId: 'v1',
        manifestHash: 'hash-abc',
        purposes: ['ASR_TRAINING', 'DATASET_REDISTRIBUTION'],
      });
      expect(narrow).not.toBe(broad);
    });

    it('is stable across the order purposes are read in', async () => {
      expect(
        vdclSigningContextHash({
          versionId: 'v1',
          manifestHash: 'h',
          purposes: ['TTS_TRAINING', 'ASR_TRAINING'],
        }),
      ).toBe(
        vdclSigningContextHash({
          versionId: 'v1',
          manifestHash: 'h',
          purposes: ['ASR_TRAINING', 'TTS_TRAINING'],
        }),
      );
    });
  });

  describe('signability', () => {
    it.each([
      VdclVersionStatus.DRAFT,
      VdclVersionStatus.PENDING_COMPILATION,
      VdclVersionStatus.PENDING_COUNTERSIGNATURE,
      VdclVersionStatus.ACTIVE,
      VdclVersionStatus.SUPERSEDED,
      VdclVersionStatus.REJECTED,
    ])('refuses to sign a version in %s', async (status) => {
      const { service } = makeService({ version: defaultVersion({ status }) });
      await expect(service.sign(signArgs)).rejects.toThrow(BadRequestException);
    });

    it('refuses to sign twice', async () => {
      const { service } = makeService({
        version: defaultVersion({ signedAt: new Date() }),
      });
      await expect(service.sign(signArgs)).rejects.toThrow(BadRequestException);
    });

    it('refuses a version with no compiled manifest', async () => {
      // Signing one would bind the contributor to a document with no
      // contents -- a licence over nothing, which reads as a valid grant.
      const { service } = makeService({
        version: defaultVersion({ manifest: null, manifestHash: null }),
      });
      await expect(service.sign(signArgs)).rejects.toThrow(/nothing to sign/i);
    });

    it('refuses a version granting no purposes', async () => {
      const { service } = makeService({ version: defaultVersion({ grants: [] }) });
      await expect(service.sign(signArgs)).rejects.toThrow(/permit nothing/i);
    });

    it('refuses to sign under a withdrawn agreement', async () => {
      const { service } = makeService({
        version: defaultVersion({
          agreement: { ...defaultVersion().agreement, withdrawnAt: new Date() },
        }),
      });
      await expect(service.sign(signArgs)).rejects.toThrow(BadRequestException);
    });

    it('re-checks KYC at signing time rather than trusting the draft', async () => {
      // Identity can lapse between compilation and signature, and a licence
      // signed on stale evidence is what the DLKYC reference exists to
      // prevent.
      const { service } = makeService({
        user: { email: 'c@example.com', kycStatus: KycStatus.EXPIRED, status: 'ACTIVE' },
      });
      await expect(service.sign(signArgs)).rejects.toThrow(ForbiddenException);
    });

    it('refuses a suspended account', async () => {
      const { service } = makeService({
        user: { email: 'c@example.com', kycStatus: KycStatus.APPROVED, status: 'SUSPENDED' },
      });
      await expect(service.sign(signArgs)).rejects.toThrow(ForbiddenException);
    });

    it('refuses to issue a code for an action that would fail', async () => {
      // A contributor must never be handed a code for something that
      // cannot complete.
      const { service, otp } = makeService({
        version: defaultVersion({ status: VdclVersionStatus.ACTIVE }),
      });

      await expect(service.requestSigningOtp('v1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(otp.issueForUser).not.toHaveBeenCalled();
    });
  });

  describe('recording the signature', () => {
    it('moves to PENDING_COUNTERSIGNATURE, never straight to ACTIVE', async () => {
      // Dialect Library countersigns separately after compliance review,
      // and only that step grants rights.
      const { service, tx } = makeService();

      const result = await service.sign(signArgs);

      expect(tx.vdclVersion.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
          }),
        }),
      );
      expect(result.status).toBe(VdclVersionStatus.PENDING_COUNTERSIGNATURE);
    });

    it('guards the status write so two concurrent signatures cannot both land', async () => {
      const { service, tx } = makeService();
      await service.sign(signArgs);
      expect(tx.vdclVersion.updateMany.mock.calls[0][0].where).toEqual({
        id: 'v1',
        status: VdclVersionStatus.PENDING_REVIEW,
        signedAt: null,
      });
    });

    it('refuses when the guarded claim finds nothing left to claim', async () => {
      const { service } = makeService({ claimCount: 0 });
      await expect(service.sign(signArgs)).rejects.toThrow(/already signed/i);
    });

    it('consumes the OTP inside the same transaction as the signature', async () => {
      // A consumed code with no signature, or a signature with a code still
      // live, are both worse than failing.
      const { service, tx } = makeService();
      await service.sign(signArgs);
      expect(tx.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'otp-row-1' },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('records the evidence without storing the code', async () => {
      const { service, tx } = makeService();

      await service.sign({
        ...signArgs,
        signatureLabel: 'Ada Okoro',
        ipAddress: '203.0.113.5',
        userAgent: 'Mozilla/5.0',
      });

      const event = tx.vdclSignatureEvent.create.mock.calls[0][0].data;
      expect(event).toMatchObject({
        eventType: 'contributor_sign',
        actorId: 'user-1',
        stepUpMethod: 'otp_email',
        signatureKind: 'typed',
        ipAddress: '203.0.113.5',
      });
      expect(JSON.stringify(event)).not.toContain(signArgs.code);
    });

    it('records what was signed, so the event stands alone later', async () => {
      const { service, tx } = makeService();
      await service.sign(signArgs);
      expect(tx.vdclSignatureEvent.create.mock.calls[0][0].data.metadata).toMatchObject({
        manifestHash: 'hash-abc',
        recordingCount: 12,
        purposes: ['ASR_TRAINING'],
        termsVersion: 'terms-1.0',
      });
    });
  });

  describe('receipt', () => {
    it('reads from the recorded event rather than re-deriving it', async () => {
      const { service } = makeService();
      const receipt = await service.getReceipt('v1', 'user-1');
      expect(receipt).toMatchObject({
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        signatureKind: 'typed',
        manifestHash: 'hash-abc',
      });
    });

    it('throws NotFound when nothing has been signed', async () => {
      const { service } = makeService({ signatureEvent: null });
      await expect(service.getReceipt('v1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('review', () => {
    it('shows the manifest and permissions about to be signed', async () => {
      const { service } = makeService();
      const review = await service.getForReview('v1', 'user-1');
      expect(review).toMatchObject({
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        manifestHash: 'hash-abc',
        purposes: [{ purpose: 'ASR_TRAINING', wordingVersion: 'w1' }],
      });
      expect(review.manifest?.totalDurationMs).toBe('48000');
    });
  });
});
