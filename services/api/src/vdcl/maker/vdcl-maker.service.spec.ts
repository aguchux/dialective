import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { VdclMakerService } from './vdcl-maker.service';

/**
 * The maker is where a contributor's own intent becomes a draft licence.
 * Two boundaries are load-bearing:
 *
 * - the dialect comes from their PROFILE, never the request, so nobody can
 *   license recordings under a dialect they do not record in;
 * - a purpose that is never offered is refused by the API, not merely
 *   absent from a screen.
 */
describe('VdclMakerService', () => {
  function makeService(opts: {
    readiness?: Record<string, unknown>;
    version?: Record<string, unknown> | null;
    compileThrows?: Error;
  } = {}) {
    const tx = {
      vdclVersion: { update: jest.fn().mockResolvedValue({ id: 'v1', status: 'REJECTED' }) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      vdclConsentGrant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      vdclVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.version === undefined ? defaultVersion() : opts.version),
      },
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const readiness = {
      check: jest.fn().mockResolvedValue(
        opts.readiness ?? { ready: true, blockers: [], dialectTag: 'ig-ng', inventory: null },
      ),
    };
    const drafts = {
      createDraft: jest.fn().mockResolvedValue({
        agreement: { id: 'a1', licenceKey: 'VDCL-NG-IGNG-USER0001' },
        version: { id: 'v1', version: 1 },
      }),
    };
    const compilation = {
      compileVersion: opts.compileThrows
        ? jest.fn().mockRejectedValue(opts.compileThrows)
        : jest.fn().mockResolvedValue({
            recordingCount: 40,
            excludedCount: 3,
            manifestHash: 'hash-abc',
          }),
    };
    return {
      service: new VdclMakerService(
        prisma as never,
        readiness as never,
        drafts as never,
        compilation as never,
      ),
      prisma,
      readiness,
      drafts,
      compilation,
      tx,
    };
  }

  function defaultVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      agreementId: 'a1',
      status: VdclVersionStatus.PENDING_REVIEW,
      signedAt: null,
      agreement: { contributorId: 'user-1' },
      ...overrides,
    };
  }

  const base = {
    contributorId: 'user-1',
    purposes: [VdclPurpose.ASR_TRAINING],
    wordingVersion: 'w1.0',
  };

  describe('startDraft', () => {
    it('creates the draft and compiles it in one go', async () => {
      const { service, compilation } = makeService();

      const result = await service.startDraft(base);

      expect(compilation.compileVersion).toHaveBeenCalledWith('v1');
      expect(result).toMatchObject({
        versionId: 'v1',
        compiled: true,
        recordingCount: 40,
        manifestHash: 'hash-abc',
      });
    });

    it('never lets the request name a dialect', async () => {
      // A licence covers whatever the contributor actually recorded, derived
      // at compile time from their own recordings. Accepting a dialect from
      // the request body would let someone assert a scope rather than have
      // one determined for them.
      const { service, drafts } = makeService();
      await service.startDraft(base);
      const arg = drafts.createDraft.mock.calls[0][0];
      expect(arg).toEqual(
        expect.objectContaining({ contributorId: 'user-1' }),
      );
      expect(arg).not.toHaveProperty('dialectTag');
      expect(arg).not.toHaveProperty('dialectTags');
    });

    it('refuses to start when readiness is not met, and says why', async () => {
      const { service, drafts } = makeService({
        readiness: {
          ready: false,
          blockers: [{ requirement: 'Identity verification (DLKYC)', detail: 'x', actionable: true }],
          dialectTag: 'ig-ng',
          inventory: null,
        },
      });

      await expect(service.startDraft(base)).rejects.toThrow(ForbiddenException);
      expect(drafts.createDraft).not.toHaveBeenCalled();
    });

    it('refuses voice cloning server-side, not merely by leaving it off a screen', async () => {
      const { service, drafts } = makeService();

      await expect(
        service.startDraft({ ...base, purposes: [VdclPurpose.VOICE_CLONING] }),
      ).rejects.toThrow(BadRequestException);
      expect(drafts.createDraft).not.toHaveBeenCalled();
    });

    it('refuses voice cloning smuggled in beside a legitimate purpose', async () => {
      const { service } = makeService();
      await expect(
        service.startDraft({
          ...base,
          purposes: [VdclPurpose.ASR_TRAINING, VdclPurpose.VOICE_CLONING],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts the sensitive purposes that ARE offered, individually', async () => {
      // The plan requires these to be separately selectable rather than
      // folded into a general checkbox, so the API must take them
      // individually.
      const { service } = makeService();
      const result = await service.startDraft({
        ...base,
        purposes: [VdclPurpose.BIOMETRIC_PROCESSING, VdclPurpose.PUBLIC_PROMOTION],
      });
      expect(result.compiled).toBe(true);
    });

    it('records consent evidence against the grants', async () => {
      const { service, prisma } = makeService();

      await service.startDraft({
        ...base,
        locale: 'en-NG',
        ipAddress: '203.0.113.5',
        userAgent: 'Mozilla/5.0',
      });

      expect(prisma.vdclConsentGrant.updateMany).toHaveBeenCalledWith({
        where: { versionId: 'v1' },
        data: { locale: 'en-NG', userAgent: 'Mozilla/5.0', ipAddress: '203.0.113.5' },
      });
    });

    it('keeps the draft when compilation fails, and reports why', async () => {
      // The tracker reads the job row and tells the contributor what
      // happened -- the whole point of not leaving a request unexplained.
      const { service } = makeService({
        compileThrows: new Error('No eligible recordings were found'),
      });

      const result = await service.startDraft(base);

      expect(result.compiled).toBe(false);
      expect(result.compilationError).toMatch(/no eligible recordings/i);
      expect(result.versionId).toBe('v1');
    });
  });

  describe('discardDraft', () => {
    it('discards an unsigned draft', async () => {
      const { service, tx } = makeService();
      const result = await service.discardDraft('v1', 'user-1');
      expect(result.status).toBe('REJECTED');
      expect(tx.vdclAuditEvent.create).toHaveBeenCalled();
    });

    it('refuses to discard once signed -- the route out is withdrawal', async () => {
      // Deleting the evidence that a signature happened is not the same as
      // ending a licence.
      const { service } = makeService({
        version: defaultVersion({
          signedAt: new Date(),
          status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
        }),
      });

      await expect(service.discardDraft('v1', 'user-1')).rejects.toThrow(/withdrawal/i);
    });

    it("refuses to discard another contributor's version", async () => {
      const { service } = makeService({
        version: defaultVersion({ agreement: { contributorId: 'someone-else' } }),
      });
      await expect(service.discardDraft('v1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it.each([VdclVersionStatus.ACTIVE, VdclVersionStatus.SUPERSEDED])(
      'refuses to discard a version in %s',
      async (status) => {
        const { service } = makeService({ version: defaultVersion({ status }) });
        await expect(service.discardDraft('v1', 'user-1')).rejects.toThrow(BadRequestException);
      },
    );
  });
});
