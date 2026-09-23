import { NotFoundException } from '@nestjs/common';
import { SubmissionStatus, VdclVersionStatus } from '@dialectiva/db';
import { ManifestInspectorService } from './manifest-inspector.service';

/**
 * Phase 2's acceptance criterion is that an admin can explain every included
 * and excluded recording. These tests are that criterion, expressed as
 * assertions.
 */
describe('ManifestInspectorService', () => {
  function decimal(value: string) {
    return { toString: () => value } as never;
  }

  function recordingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rec-1',
      userId: 'user-1',
      dialectTag: 'ig-ng',
      status: SubmissionStatus.SCORED,
      score: decimal('82.00'),
      compositeScore: decimal('80.00'),
      durationMs: 2400,
      transcript: 'hello',
      audioKey: 'recordings/a.webm',
      audioDeletedAt: null,
      misplacedDialectAt: null,
      noAudioClawedBackAt: null,
      ...overrides,
    };
  }

  function makeService(opts: {
    version?: Record<string, unknown> | null;
    manifestItems?: Record<string, unknown>[];
    recordings?: Record<string, unknown>[];
    purgedCount?: number;
  } = {}) {
    const prisma = {
      vdclVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.version === undefined ? defaultVersion() : opts.version),
      },
      vdclManifestItem: {
        findMany: jest.fn().mockResolvedValue(opts.manifestItems ?? []),
        count: jest
          .fn()
          .mockResolvedValueOnce(opts.manifestItems?.length ?? 0)
          .mockResolvedValueOnce(opts.purgedCount ?? 0),
      },
      wordRecording: {
        findMany: jest
          .fn()
          .mockImplementation(({ cursor }) =>
            Promise.resolve(cursor ? [] : (opts.recordings ?? [])),
          ),
      },
    };
    return { service: new ManifestInspectorService(prisma as never), prisma };
  }

  function defaultVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      status: VdclVersionStatus.PENDING_REVIEW,
      manifestHash: 'abc',
      agreement: {
        id: 'a1',
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        contributorId: 'user-1',
        dialectTag: 'ig-ng',
        countryId: 'c1',
        withdrawnAt: null,
        country: { code: 'NG', name: 'Nigeria' },
      },
      manifest: {
        id: 'm1',
        manifestKey: 'VDM-NG-USER0001-1',
        dialectTags: ['ig-ng'],
        recordingCount: 1,
        totalDurationMs: 2400n,
        transcriptCount: 1,
        excludedCount: 0,
        meanCompositeScore: decimal('80.00'),
        asrPipelineVersion: 'whisper',
        qualityPipelineVersion: null,
      },
      grants: [{ purpose: 'ASR_TRAINING' }],
      compilationJob: { stage: 'COMPLIANCE_REVIEW' },
      ...overrides,
    };
  }

  describe('inspect', () => {
    it('reports a version that has not been compiled rather than failing', async () => {
      const { service } = makeService({ version: defaultVersion({ manifest: null }) });
      const result = await service.inspect('v1');
      expect(result.manifest).toBeNull();
      expect(result.message).toMatch(/not been compiled/i);
    });

    it('serialises BigInt duration so the response can be encoded as JSON', async () => {
      const { service } = makeService();
      const result = await service.inspect('v1');
      expect(result.manifest?.totalDurationMs).toBe('2400');
    });

    it('surfaces purged licensed audio as an anomaly, not a routine column', async () => {
      // Licensed audio is meant to be retention-exempt, so a purge here
      // means the exemption was off or failed.
      const { service } = makeService({ purgedCount: 3 });
      const result = await service.inspect('v1');
      expect(result.anomalies).toEqual([
        expect.objectContaining({ kind: 'audio_purged_despite_licence', count: 3 }),
      ]);
    });

    it('reports no anomalies when nothing was purged', async () => {
      const { service } = makeService();
      expect((await service.inspect('v1')).anomalies).toEqual([]);
    });

    it('throws NotFound for an unknown version', async () => {
      const { service } = makeService({ version: null });
      await expect(service.inspect('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('explainExclusions', () => {
    it('accounts for every recording with a reason and a label', async () => {
      const { service } = makeService({
        manifestItems: [{ recordingId: 'ok' }],
        recordings: [
          recordingRow({ id: 'ok' }),
          recordingRow({ id: 'p1', status: SubmissionStatus.PENDING }),
          recordingRow({ id: 'p2', status: SubmissionStatus.PENDING }),
          recordingRow({ id: 'gone', audioKey: null, audioDeletedAt: new Date() }),
        ],
      });

      const result = await service.explainExclusions('v1');

      expect(result.coveredInManifest).toBe(1);
      expect(result.exclusions).toEqual([
        expect.objectContaining({ reason: 'not_yet_scored', count: 2, transient: true }),
        expect.objectContaining({ reason: 'audio_purged', count: 1, transient: false }),
      ]);
      expect(result.exclusions[0].label).toBeTruthy();
    });

    it('separates reasons a contributor can act on from ones they cannot', async () => {
      // Presenting these as one list invites people to chase clips that are
      // gone forever.
      const { service } = makeService({
        recordings: [
          recordingRow({ id: 'p', status: SubmissionStatus.PENDING }),
          recordingRow({ id: 'g', audioKey: null, audioDeletedAt: new Date() }),
        ],
      });

      const result = await service.explainExclusions('v1');
      const byReason = Object.fromEntries(result.exclusions.map((e) => [e.reason, e.transient]));
      expect(byReason).toEqual({ not_yet_scored: true, audio_purged: false });
    });

    it('flags newer eligible work that the frozen manifest does not cover', async () => {
      // Not a defect -- it is exactly what a new version picks up -- but an
      // admin needs it to answer "why isn't my latest work licensed?".
      const { service } = makeService({
        manifestItems: [{ recordingId: 'old' }],
        recordings: [recordingRow({ id: 'old' }), recordingRow({ id: 'new' })],
      });

      const result = await service.explainExclusions('v1');

      expect(result.eligibleButNotInManifest).toBe(1);
      expect(result.exclusions).toEqual([]);
    });

    it('flags covered clips that would no longer pass eligibility today', async () => {
      // The licence still covers them -- a signed manifest does not shrink
      // because a clip's state changed afterwards -- but it is worth
      // knowing.
      const { service } = makeService({
        manifestItems: [{ recordingId: 'rec-1' }],
        recordings: [recordingRow({ id: 'rec-1', misplacedDialectAt: new Date() })],
      });

      const result = await service.explainExclusions('v1');

      expect(result.coveredNoLongerEligible).toBe(1);
    });

    it('ignores recordings belonging to a different dialect entirely', async () => {
      const { service } = makeService({
        recordings: [recordingRow({ id: 'yo', dialectTag: 'yo-ng' })],
      });
      const result = await service.explainExclusions('v1');
      expect(result.exclusions).toEqual([]);
    });

    it('caps the sample ids so a huge exclusion set stays readable', async () => {
      const { service } = makeService({
        recordings: Array.from({ length: 30 }, (_, i) =>
          recordingRow({ id: `p${i}`, status: SubmissionStatus.PENDING }),
        ),
      });

      const result = await service.explainExclusions('v1');

      expect(result.exclusions[0].count).toBe(30);
      expect(result.exclusions[0].sampleRecordingIds).toHaveLength(10);
    });
  });

  describe('verifyHash', () => {
    function hashService(storedHash: string | null, items: Record<string, unknown>[]) {
      const prisma = {
        vdclVersion: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'v1',
            version: 1,
            manifestHash: storedHash,
            agreement: {
              licenceKey: 'VDCL-NG-IGNG-USER0001',
              contributorId: 'user-1',
              dialectTag: 'ig-ng',
              countryId: 'c1',
            },
            manifest: {
              manifestKey: 'VDM-NG-USER0001-1',
        dialectTags: ['ig-ng'],
              recordingCount: items.length,
              totalDurationMs: 2400n,
              transcriptCount: 1,
              excludedCount: 0,
              meanCompositeScore: decimal('80.00'),
              asrPipelineVersion: 'whisper',
              qualityPipelineVersion: null,
              items,
            },
            grants: [{ purpose: 'ASR_TRAINING' }],
          }),
        },
      };
      return new ManifestInspectorService(prisma as never);
    }

    const item = {
      recordingId: 'rec-1',
      durationMs: 2400,
      dialectTag: 'ig-ng',
      compositeScore: decimal('80.00'),
      score: decimal('82.00'),
      hasTranscript: true,
    };

    it('detects a manifest whose rows were altered after issuance', async () => {
      // This is what makes the hash worth printing on a document. Without
      // it, a discrepancy surfaces years later when a subscriber tries to
      // verify a certificate.
      const service = hashService('a-hash-that-does-not-match', [item]);
      const result = await service.verifyHash('v1');
      expect(result.matches).toBe(false);
      expect(result.recomputedHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('confirms an untouched manifest', async () => {
      const first = await hashService(null, [item]).verifyHash('v1');
      const second = await hashService(first.recomputedHash, [item]).verifyHash('v1');
      expect(second.matches).toBe(true);
    });

    it('throws NotFound when there is no manifest to verify', async () => {
      const prisma = {
        vdclVersion: {
          findUnique: jest.fn().mockResolvedValue({ id: 'v1', manifest: null, grants: [] }),
        },
      };
      await expect(
        new ManifestInspectorService(prisma as never).verifyHash('v1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
