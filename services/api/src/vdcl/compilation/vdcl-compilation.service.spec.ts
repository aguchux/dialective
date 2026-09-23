import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubmissionStatus, VdclVersionStatus } from '@dialectiva/db';
import { VdclCompilationService } from './vdcl-compilation.service';

/**
 * Compilation turns "this person recorded for us" into "this licence covers
 * exactly these clips". Three properties are load-bearing and each has a
 * distinct failure mode:
 *
 * - immutable: recompiling in place would change what a signature covers;
 * - explainable: an admin must account for every clip, included or not;
 * - reproducible: the hash on the PDF has to be recomputable.
 */
describe('VdclCompilationService', () => {
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
      asrEngine: 'whisper',
      qualityGateCheckedAt: new Date(),
      ...overrides,
    };
  }

  function makeService(opts: {
    version?: Record<string, unknown> | null;
    recordings?: Record<string, unknown>[];
  } = {}) {
    const recordings = opts.recordings ?? [recordingRow()];
    const tx = {
      vdclManifest: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
      vdclVersion: { update: jest.fn().mockResolvedValue({}) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      vdclVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.version === undefined ? defaultVersion() : opts.version),
      },
      vdclCompilationJob: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      wordRecording: {
        findMany: jest.fn().mockImplementation(({ cursor }) =>
          Promise.resolve(cursor ? [] : recordings),
        ),
      },
      $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    return { service: new VdclCompilationService(prisma as never), prisma, tx };
  }

  function defaultVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      agreementId: 'a1',
      status: VdclVersionStatus.DRAFT,
      manifest: null,
      grants: [{ purpose: 'ASR_TRAINING' }],
      agreement: {
        contributorId: 'user-1',
        dialectTag: 'ig-ng',
        countryId: 'c1',
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        withdrawnAt: null,
        country: { code: 'NG' },
      },
      ...overrides,
    };
  }

  describe('immutability', () => {
    it('refuses to recompile a version that already has a manifest', async () => {
      // A manifest is what a signature covers. Replacing one in place means
      // the contributor signed a different document than the one on file.
      const { service } = makeService({
        version: defaultVersion({ manifest: { id: 'm-existing' } }),
      });

      await expect(service.compileVersion('v1')).rejects.toThrow(BadRequestException);
    });

    it.each([
      VdclVersionStatus.ACTIVE,
      VdclVersionStatus.PENDING_REVIEW,
      VdclVersionStatus.PENDING_COUNTERSIGNATURE,
      VdclVersionStatus.SUPERSEDED,
      VdclVersionStatus.WITHDRAWN,
    ])('refuses to compile a version in %s', async (status) => {
      const { service } = makeService({ version: defaultVersion({ status }) });
      await expect(service.compileVersion('v1')).rejects.toThrow(BadRequestException);
    });

    it('refuses to compile under a withdrawn agreement', async () => {
      const { service } = makeService({
        version: defaultVersion({
          agreement: { ...defaultVersion().agreement, withdrawnAt: new Date() },
        }),
      });
      await expect(service.compileVersion('v1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for an unknown version', async () => {
      const { service } = makeService({ version: null });
      await expect(service.compileVersion('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('compiling', () => {
    it('writes a manifest and moves the version to PENDING_REVIEW, not ACTIVE', async () => {
      // Compilation produces a document. A human decides whether it is
      // signed -- activation stays a separate, deliberate act.
      const { service, tx } = makeService();

      const result = await service.compileVersion('v1');

      expect(result.recordingCount).toBe(1);
      expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(tx.vdclVersion.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { status: VdclVersionStatus.PENDING_REVIEW, manifestHash: result.manifestHash },
      });
    });

    it('builds the manifest key from country and contributor, with no dialect', async () => {
      const { service, tx } = makeService();
      await service.compileVersion('v1');
      expect(tx.vdclManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ manifestKey: expect.stringMatching(/^VDM-NG-USER1-/) }),
        }),
      );
    });

    it('refuses to produce an empty manifest', async () => {
      // An empty manifest reads as a valid licence granting rights over
      // nothing, and would be signed as such.
      const { service } = makeService({
        recordings: [recordingRow({ status: SubmissionStatus.PENDING })],
      });

      await expect(service.compileVersion('v1')).rejects.toThrow(
        /nothing to license/i,
      );
    });

    it('counts and explains every excluded recording', async () => {
      // The phase's acceptance criterion: an admin can explain every
      // included AND excluded recording.
      const { service } = makeService({
        recordings: [
          recordingRow({ id: 'ok' }),
          recordingRow({ id: 'pending', status: SubmissionStatus.PENDING }),
          recordingRow({ id: 'gone', audioKey: null, audioDeletedAt: new Date() }),
          recordingRow({ id: 'rejected', status: SubmissionStatus.REJECTED }),
        ],
      });

      const result = await service.compileVersion('v1');

      expect(result.recordingCount).toBe(1);
      expect(result.excludedCount).toBe(3);
      expect(result.exclusionsByReason).toEqual({
        not_yet_scored: 1,
        audio_purged: 1,
        rejected_by_quality_gate: 1,
      });
    });

    it('covers every dialect the contributor recorded in, under one licence', async () => {
      // The whole point of a holistic licence. Previously the yo-ng
      // recording was silently out of scope, so a contributor who changed
      // dialect accumulated unlicensed work with nothing telling them.
      const { service } = makeService({
        recordings: [recordingRow({ id: 'ok' }), recordingRow({ id: 'yo', dialectTag: 'yo-ng' })],
      });

      const result = await service.compileVersion('v1');

      expect(result.recordingCount).toBe(2);
      expect(result.excludedCount).toBe(0);
    });

    it('records the dialects it actually covered on the manifest', async () => {
      // Derived from the items, never from the contributor's profile: the
      // manifest is what makes the licence self-describing now that the key
      // no longer names a dialect.
      const { service, tx } = makeService({
        recordings: [
          recordingRow({ id: 'b', dialectTag: 'pcm' }),
          recordingRow({ id: 'a', dialectTag: 'ig-ng' }),
        ],
      });

      await service.compileVersion('v1');

      expect(tx.vdclManifest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dialectTags: ['ig-ng', 'pcm'] }),
        }),
      );
    });

    it('aggregates duration, transcript coverage and mean score over covered items only', async () => {
      const { service, tx } = makeService({
        recordings: [
          recordingRow({ id: 'a', durationMs: 1000, compositeScore: decimal('70.00') }),
          recordingRow({
            id: 'b',
            durationMs: 3000,
            compositeScore: decimal('90.00'),
            transcript: null,
          }),
          // Excluded -- must not contribute to any metric.
          recordingRow({
            id: 'c',
            durationMs: 9999,
            compositeScore: decimal('10.00'),
            status: SubmissionStatus.REJECTED,
          }),
        ],
      });

      await service.compileVersion('v1');

      const data = tx.vdclManifest.create.mock.calls[0][0].data;
      expect(data.recordingCount).toBe(2);
      expect(data.totalDurationMs).toBe(4000n);
      expect(data.transcriptCount).toBe(1);
      expect(data.meanCompositeScore.toString()).toBe('80');
    });

    it('records which ASR engine actually produced the transcripts', async () => {
      // What matters is the engine that produced THESE transcripts, not the
      // one configured today -- a score means nothing without knowing which
      // scorer produced it.
      const { service, tx } = makeService({
        recordings: [
          recordingRow({ id: 'a', asrEngine: 'whisper' }),
          recordingRow({ id: 'b', asrEngine: 'vosk' }),
        ],
      });

      await service.compileVersion('v1');

      expect(tx.vdclManifest.create.mock.calls[0][0].data.asrPipelineVersion).toBe(
        'vosk+whisper',
      );
    });

    it('carries metric definitions alongside the numbers', async () => {
      const { service, tx } = makeService();
      await service.compileVersion('v1');
      const defs = tx.vdclManifest.create.mock.calls[0][0].data.scoreDefinitions;
      expect(defs.meanCompositeScore).toBeTruthy();
    });

    it('marks the job failed with a blocker message rather than leaving it pending', async () => {
      // The plan is explicit that a request must never sit in an
      // unexplained pending state.
      const { service, prisma } = makeService({
        recordings: [recordingRow({ status: SubmissionStatus.PENDING })],
      });

      await expect(service.compileVersion('v1')).rejects.toThrow();

      expect(prisma.vdclCompilationJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stage: 'FAILED',
            blockerMessage: expect.any(String),
          }),
        }),
      );
    });

    it('produces the same hash for the same inputs', async () => {
      const first = await makeService().service.compileVersion('v1');
      const second = await makeService().service.compileVersion('v1');
      expect(first.manifestHash).toBe(second.manifestHash);
    });
  });

  describe('previewInventory', () => {
    it('agrees with what compilation would actually produce', async () => {
      // A preview promising 400 clips and delivering 300 is worse than no
      // preview, so both run the same classify.
      const recordings = [
        recordingRow({ id: 'a' }),
        recordingRow({ id: 'b', status: SubmissionStatus.REJECTED }),
      ];
      const { service } = makeService({ recordings });

      const preview = await service.previewInventory({ contributorId: 'user-1' });
      const compiled = await makeService({ recordings }).service.compileVersion('v1');

      expect(preview.eligibleCount).toBe(compiled.recordingCount);
      expect(preview.excludedCount).toBe(compiled.excludedCount);
      expect(preview.exclusionsByReason).toEqual(compiled.exclusionsByReason);
    });

    it('reports zero rather than throwing when nothing is eligible', async () => {
      // Preview is a question, not an attempt -- it answers "nothing yet"
      // where compilation would refuse.
      const { service } = makeService({
        recordings: [recordingRow({ status: SubmissionStatus.PENDING })],
      });

      const preview = await service.previewInventory({ contributorId: 'user-1' });

      expect(preview.eligibleCount).toBe(0);
      expect(preview.meanCompositeScore).toBeNull();
    });
  });
});
