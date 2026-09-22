import { VdclVersionStatus } from '@dialectiva/db';
import { VdclVerificationService } from './verification.service';
import { issueVerificationToken } from './verification-token.util';

/**
 * Public verification is the most exposed surface of the mutual anonymity
 * guarantee. A certificate gets printed, photographed and attached to
 * datasets sold onward, so whatever this endpoint returns should be assumed
 * permanently public.
 *
 * These tests pin both halves: it answers "is this licence real and in
 * force?" honestly, and it never answers "whose licence is it?".
 */
describe('VdclVerificationService', () => {
  const ORIGINAL = process.env.VDCL_VERIFICATION_SECRET;

  beforeEach(() => {
    process.env.VDCL_VERIFICATION_SECRET = 'test-secret-at-least-16-chars';
  });

  afterAll(() => {
    process.env.VDCL_VERIFICATION_SECRET = ORIGINAL;
  });

  const MANIFEST_HASH =
    'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  function makeService(version?: Record<string, unknown> | null) {
    const prisma = {
      vdclVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue(version === undefined ? defaultVersion() : version),
      },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    return { service: new VdclVerificationService(prisma as never), prisma };
  }

  function defaultVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      status: VdclVersionStatus.ACTIVE,
      manifestHash: MANIFEST_HASH,
      countersignedAt: new Date('2026-09-20T00:00:00Z'),
      effectiveFrom: new Date('2026-09-20T00:00:00Z'),
      agreement: {
        licenceKey: 'VDCL-NG-IGNG-A1B2C3D4',
        contributorId: 'a1b2c3d4-0000-4000-8000-000000000001',
        dialectTag: 'ig-ng',
        withdrawnAt: null,
        activeVersionId: 'v1',
        country: { name: 'Nigeria' },
      },
      manifest: { recordingCount: 120, totalDurationMs: 480000n, transcriptCount: 118 },
      grants: [{ purpose: 'ASR_TRAINING' }],
      ...overrides,
    };
  }

  function tokenFor(version = 1, hash = MANIFEST_HASH) {
    return issueVerificationToken({ versionId: 'v1', version, manifestHash: hash }).token;
  }

  describe('what it discloses', () => {
    it('confirms a valid licence with its metrics', async () => {
      const { service } = makeService();
      const result = await service.verify(tokenFor());
      expect(result).toMatchObject({
        outcome: 'valid',
        licenceKey: 'VDCL-NG-IGNG-A1B2C3D4',
        recordingCount: 120,
        hashMatches: true,
      });
    });

    it('never returns the contributor identity', async () => {
      // The single most important assertion in this file. Anything here is
      // public forever.
      const { service } = makeService();
      const result = await service.verify(tokenFor());
      const serialised = JSON.stringify(result);

      expect(serialised).not.toContain('a1b2c3d4-0000-4000-8000-000000000001');
      expect(Object.keys(result)).not.toContain('contributorId');
      expect(Object.keys(result)).not.toContain('contributorName');
      expect(Object.keys(result)).not.toContain('email');
    });

    it('labels the contributor without naming them', async () => {
      const { service } = makeService();
      const result = await service.verify(tokenFor());
      expect(result.contributorLabel).toMatch(/^Contributor [A-Z0-9]{6}$/);
    });

    it('never returns the covered recording ids', async () => {
      // Which clips a licence covers is the contributor's own work, not a
      // stranger's to enumerate.
      const { service } = makeService();
      const result = await service.verify(tokenFor());
      expect(Object.keys(result)).not.toContain('items');
      expect(Object.keys(result)).not.toContain('recordingIds');
    });
  });

  describe('status', () => {
    it.each([
      [VdclVersionStatus.SUSPENDED, 'suspended'],
      [VdclVersionStatus.SUPERSEDED, 'superseded'],
      [VdclVersionStatus.WITHDRAWN, 'withdrawn'],
    ])('reports %s as %s', async (status, outcome) => {
      const { service } = makeService(defaultVersion({ status }));
      expect((await service.verify(tokenFor())).outcome).toBe(outcome);
    });

    it('lets a withdrawal outrank the version status', async () => {
      // Withdrawal is the contributor's own decision, and a scanner must
      // see it even if the version's status row lags behind.
      const { service } = makeService(
        defaultVersion({
          status: VdclVersionStatus.ACTIVE,
          agreement: { ...defaultVersion().agreement, withdrawnAt: new Date() },
        }),
      );
      expect((await service.verify(tokenFor())).outcome).toBe('withdrawn');
    });

    it.each([
      VdclVersionStatus.DRAFT,
      VdclVersionStatus.PENDING_REVIEW,
      VdclVersionStatus.PENDING_COUNTERSIGNATURE,
      VdclVersionStatus.REJECTED,
    ])('never reads %s as valid', async (status) => {
      // A certificate must not read as valid before Dialect Library has
      // countersigned.
      const { service } = makeService(defaultVersion({ status }));
      expect((await service.verify(tokenFor())).outcome).toBe('not_yet_active');
    });
  });

  describe('forgery', () => {
    it('reports a hash mismatch when the document describes something else', async () => {
      const { service } = makeService();
      const result = await service.verify(tokenFor(1, 'ffffffffffffffffffffffffffffffff'));
      expect(result.outcome).toBe('hash_mismatch');
    });

    it('discloses nothing at all on a mismatch', async () => {
      // Confirming which fields differ would help someone iterate toward a
      // forgery that passes.
      const { service } = makeService();
      const result = await service.verify(tokenFor(1, 'ffffffffffffffffffffffffffffffff'));
      expect(result.licenceKey).toBeNull();
      expect(result.recordingCount).toBeNull();
      expect(result.contributorLabel).toBeNull();
    });

    it('rejects a version number that does not match the document', async () => {
      // A v1 certificate must not verify against a v3 licence that happens
      // to share a manifest hash prefix.
      const { service } = makeService();
      expect((await service.verify(tokenFor(3))).outcome).toBe('hash_mismatch');
    });

    it('returns unknown for an unsigned token', async () => {
      const { service } = makeService();
      expect((await service.verify('not-a-real-token')).outcome).toBe('unknown');
    });

    it('returns unknown for a well-signed token naming a version that does not exist', async () => {
      const { service } = makeService(null);
      expect((await service.verify(tokenFor())).outcome).toBe('unknown');
    });

    it('returns unknown for a version that was never compiled', async () => {
      const { service } = makeService(defaultVersion({ manifestHash: null }));
      expect((await service.verify(tokenFor())).outcome).toBe('unknown');
    });
  });

  describe('scan logging', () => {
    it('records the scan and its outcome', async () => {
      const { service, prisma } = makeService();
      await service.verify(tokenFor());
      expect(prisma.vdclAuditEvent.create).toHaveBeenCalledWith({
        data: { versionId: 'v1', eventType: 'verification_scan', detail: 'valid' },
      });
    });

    it('does not record who scanned it', async () => {
      // Counting scans is useful; building a record of who examined whose
      // licence is surveillance of subscribers rather than protection of
      // contributors.
      const { service, prisma } = makeService();
      await service.verify(tokenFor());
      const logged = JSON.stringify(prisma.vdclAuditEvent.create.mock.calls[0][0]);
      expect(logged).not.toContain('ipAddress');
      expect(logged).not.toContain('actorId');
    });

    it('still answers when the audit write fails', async () => {
      // The scanner's question is legitimate, and answering it matters more
      // than the log.
      const { service, prisma } = makeService();
      prisma.vdclAuditEvent.create.mockRejectedValue(new Error('db down'));
      expect((await service.verify(tokenFor())).outcome).toBe('valid');
    });
  });
});
