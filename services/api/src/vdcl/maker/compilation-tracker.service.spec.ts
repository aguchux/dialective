import { NotFoundException } from '@nestjs/common';
import { VdclCompilationStage, VdclVersionStatus } from '@dialectiva/db';
import { CompilationTrackerService } from './compilation-tracker.service';

/**
 * The plan's requirement is blunt: do not leave the request in an
 * unexplained pending state. So the property under test is that every
 * response says which stage is current, whose move it is, and what to do --
 * never a bare "processing".
 *
 * The distinction that matters most is "waiting on us" versus "waiting on
 * you". A contributor who thinks Dialect Library is working on something
 * that is actually waiting on their signature will wait indefinitely.
 */
describe('CompilationTrackerService', () => {
  function makeService(version?: Record<string, unknown> | null) {
    const prisma = {
      vdclVersion: {
        findUnique: jest
          .fn()
          .mockResolvedValue(version === undefined ? defaultVersion() : version),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return { service: new CompilationTrackerService(prisma as never), prisma };
  }

  function defaultVersion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'v1',
      version: 1,
      status: VdclVersionStatus.PENDING_REVIEW,
      signedAt: null,
      countersignedAt: null,
      agreement: {
        contributorId: 'user-1',
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        withdrawnAt: null,
      },
      compilationJob: {
        stage: VdclCompilationStage.COMPLIANCE_REVIEW,
        progressPercent: 90,
        blockerMessage: null,
        failureReason: null,
        estimatedCompletionAt: null,
      },
      manifest: { recordingCount: 12, compiledAt: new Date() },
      ...overrides,
    };
  }

  it('refuses a version belonging to another contributor', async () => {
    const { service } = makeService(
      defaultVersion({
        agreement: { contributorId: 'someone-else', licenceKey: 'k', withdrawnAt: null },
      }),
    );
    await expect(service.track('v1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('always names the current stage and never returns a bare pending', async () => {
    const { service } = makeService();
    const result = await service.track('v1', 'user-1');
    const current = result.stages.filter((s) => s.state === 'current');
    expect(current).toHaveLength(1);
    expect(current[0].stage).toBe(VdclCompilationStage.COMPLIANCE_REVIEW);
    expect(result.nextAction).toBeTruthy();
  });

  it('tells a contributor awaiting review that the next move is theirs', async () => {
    const { service } = makeService();
    const result = await service.track('v1', 'user-1');
    expect(result.waitingOn).toBe('you');
    expect(result.nextAction).toMatch(/sign/i);
  });

  it('tells a contributor who has signed that Dialect Library has it', async () => {
    const { service } = makeService(
      defaultVersion({
        status: VdclVersionStatus.PENDING_COUNTERSIGNATURE,
        signedAt: new Date(),
      }),
    );
    const result = await service.track('v1', 'user-1');
    expect(result.waitingOn).toBe('dialect_library');
    expect(result.nextAction).toMatch(/countersign/i);
  });

  it("lets the version's status outrank a stale job stage", async () => {
    // The job stops at COMPLIANCE_REVIEW; everything after is driven by
    // signature and countersignature on the version. Reading the job alone
    // would leave an issued licence displaying "compliance review" forever.
    const { service } = makeService(
      defaultVersion({
        status: VdclVersionStatus.ACTIVE,
        compilationJob: {
          stage: VdclCompilationStage.COMPLIANCE_REVIEW,
          progressPercent: 90,
          blockerMessage: null,
          failureReason: null,
        },
      }),
    );

    const result = await service.track('v1', 'user-1');

    expect(result.stages.at(-1)).toMatchObject({
      stage: VdclCompilationStage.ISSUED,
      state: 'current',
    });
    expect(result.progressPercent).toBe(100);
    expect(result.waitingOn).toBe('nobody');
  });

  it('marks the failed stage as failed and explains it', async () => {
    const { service } = makeService(
      defaultVersion({
        status: VdclVersionStatus.PENDING_COMPILATION,
        compilationJob: {
          stage: VdclCompilationStage.FAILED,
          progressPercent: 40,
          blockerMessage: 'Compilation could not finish.',
          failureReason: 'no eligible recordings',
        },
      }),
    );

    const result = await service.track('v1', 'user-1');

    expect(result.blockerMessage).toBeTruthy();
    expect(result.failureReason).toBe('no eligible recordings');
    expect(result.waitingOn).toBe('dialect_library');
  });

  it('does not report a failure reason when nothing failed', async () => {
    const { service } = makeService();
    expect((await service.track('v1', 'user-1')).failureReason).toBeNull();
  });

  it('marks earlier stages done and later ones pending', async () => {
    const { service } = makeService();
    const result = await service.track('v1', 'user-1');
    const states = result.stages.map((s) => s.state);
    expect(states.slice(0, 5).every((s) => s === 'done')).toBe(true);
    expect(states.slice(6).every((s) => s === 'pending')).toBe(true);
  });

  it('explains a rejected version rather than showing it as merely stopped', async () => {
    const { service } = makeService(
      defaultVersion({ status: VdclVersionStatus.REJECTED }),
    );
    const result = await service.track('v1', 'user-1');
    expect(result.nextAction).toMatch(/support/i);
  });

  it('explains a suspended licence', async () => {
    const { service } = makeService(
      defaultVersion({ status: VdclVersionStatus.SUSPENDED }),
    );
    expect((await service.track('v1', 'user-1')).nextAction).toMatch(/suspended/i);
  });

  it('shows a still-compiling version as waiting on Dialect Library', async () => {
    const { service } = makeService(
      defaultVersion({
        status: VdclVersionStatus.DRAFT,
        manifest: null,
        compilationJob: {
          stage: VdclCompilationStage.INVENTORYING,
          progressPercent: 10,
          blockerMessage: null,
          failureReason: null,
        },
      }),
    );
    const result = await service.track('v1', 'user-1');
    expect(result.waitingOn).toBe('dialect_library');
    expect(result.nextAction).toMatch(/compiled/i);
  });

  it('handles a version with no compilation job at all', async () => {
    const { service } = makeService(
      defaultVersion({ status: VdclVersionStatus.DRAFT, compilationJob: null, manifest: null }),
    );
    const result = await service.track('v1', 'user-1');
    expect(result.blockerMessage).toBeNull();
    expect(result.stages.some((s) => s.state === 'current')).toBe(true);
  });

  describe('listForContributor', () => {
    it('summarises every version, newest first', async () => {
      const { service, prisma } = makeService();
      prisma.vdclVersion.findMany.mockResolvedValue([
        {
          id: 'v2',
          version: 2,
          status: VdclVersionStatus.PENDING_REVIEW,
          signedAt: null,
          countersignedAt: null,
          createdAt: new Date(),
          agreement: { licenceKey: 'k', dialectTag: 'ig-ng', withdrawnAt: null },
          manifest: { recordingCount: 20 },
          compilationJob: { stage: 'COMPLIANCE_REVIEW', blockerMessage: null },
        },
      ]);

      const result = await service.listForContributor('user-1');

      expect(result).toEqual([
        expect.objectContaining({ versionId: 'v2', recordingCount: 20, withdrawn: false }),
      ]);
    });
  });
});
