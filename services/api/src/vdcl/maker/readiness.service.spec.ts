import { KycStatus } from '@dialectiva/db';
import { VdclReadinessService } from './readiness.service';

/**
 * Readiness decides whether someone reaches a signature screen at all.
 *
 * The posture under test: a contributor should never get into a signing
 * flow they are not entitled to finish. Discovering at the final step that
 * your KYC lapsed is worse than being told up front, and a half-finished
 * flow leaves rows behind that mean nothing.
 */
describe('VdclReadinessService', () => {
  function makeService(opts: {
    user?: Record<string, unknown> | null;
    agreement?: Record<string, unknown> | null;
    inventory?: Record<string, unknown>;
  } = {}) {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.user === undefined ? defaultUser() : opts.user),
      },
      vdclAgreement: {
        findUnique: jest.fn().mockResolvedValue(opts.agreement ?? null),
      },
    };
    const compilation = {
      previewInventory: jest.fn().mockResolvedValue(
        opts.inventory ?? {
          eligibleCount: 40,
          excludedCount: 3,
          exclusionsByReason: { not_yet_scored: 3 },
          totalDurationMs: '96000',
          transcriptCount: 38,
          meanCompositeScore: 81.2,
          dialectTags: ['ig-ng'],
        },
      ),
    };
    return {
      service: new VdclReadinessService(prisma as never, compilation as never),
      prisma,
      compilation,
    };
  }

  function defaultUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      emailVerified: new Date(),
      status: 'ACTIVE',
      kycStatus: KycStatus.APPROVED,
      countryId: 'c1',
      dialect: { tag: 'ig-ng' },
      ...overrides,
    };
  }

  function reasons(blockers: { requirement: string }[]) {
    return blockers.map((b) => b.requirement);
  }

  it('passes a verified, KYC-approved contributor with eligible recordings', async () => {
    const { service } = makeService();
    const result = await service.check('user-1');
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.inventory?.eligibleCount).toBe(40);
  });

  it('blocks an unverified email', async () => {
    const { service } = makeService({ user: defaultUser({ emailVerified: null }) });
    const result = await service.check('user-1');
    expect(result.ready).toBe(false);
    expect(reasons(result.blockers)).toContain('Verified account');
  });

  it.each([
    KycStatus.NOT_STARTED,
    KycStatus.IN_PROGRESS,
    KycStatus.IN_REVIEW,
    KycStatus.DECLINED,
    KycStatus.EXPIRED,
    KycStatus.ABANDONED,
  ])('blocks signing when KYC is %s', async (kycStatus) => {
    // A VDCL names a real person. Signing against an unverified identity
    // would leave DL unable to say who granted the rights it licenses on.
    const { service } = makeService({ user: defaultUser({ kycStatus }) });
    const result = await service.check('user-1');
    expect(result.ready).toBe(false);
    expect(reasons(result.blockers)).toContain('Identity verification (DLKYC)');
  });

  it('marks a KYC review in progress as not actionable by the contributor', async () => {
    // Telling someone to "go do" something they are already waiting on
    // sends them in a circle.
    const { service } = makeService({ user: defaultUser({ kycStatus: KycStatus.IN_REVIEW }) });
    const result = await service.check('user-1');
    const kyc = result.blockers.find((b) => b.requirement === 'Identity verification (DLKYC)');
    expect(kyc?.actionable).toBe(false);
  });

  it('marks a declined KYC as something the contributor can act on', async () => {
    const { service } = makeService({ user: defaultUser({ kycStatus: KycStatus.DECLINED }) });
    const kyc = (await service.check('user-1')).blockers.find(
      (b) => b.requirement === 'Identity verification (DLKYC)',
    );
    expect(kyc?.actionable).toBe(true);
  });

  it('blocks a suspended account without telling them to fix it themselves', async () => {
    const { service } = makeService({ user: defaultUser({ status: 'SUSPENDED' }) });
    const result = await service.check('user-1');
    const blocker = result.blockers.find(
      (b) => b.requirement === 'Account in good standing',
    );
    expect(blocker?.actionable).toBe(false);
  });

  /**
   * The profile dialect used to be a hard blocker. It no longer is: a
   * licence covers every dialect the contributor has recorded in, so a
   * profile field that can only name one of them is the wrong thing to gate
   * on -- and gating on it blocked exactly the multi-dialect contributors
   * this model exists to serve.
   */
  it('does not block a contributor whose profile dialect is unset', async () => {
    const { service, compilation } = makeService({ user: defaultUser({ dialect: null }) });
    const result = await service.check('user-1');
    expect(reasons(result.blockers)).not.toContain('Active dialect profile');
    // The inventory is what decides, and it is scoped to the contributor.
    expect(compilation.previewInventory).toHaveBeenCalledWith({ contributorId: 'user-1' });
  });

  it('reports every dialect the contributor has eligible recordings in', async () => {
    const { service } = makeService({
      inventory: { eligibleCount: 60, dialectTags: ['ig', 'pcm'] },
    });
    const result = await service.check('user-1');
    expect(result.dialectTags).toEqual(['ig', 'pcm']);
  });

  it('blocks when no recordings are eligible yet', async () => {
    const { service } = makeService({
      inventory: {
        eligibleCount: 0,
        excludedCount: 5,
        exclusionsByReason: { not_yet_scored: 5 },
        totalDurationMs: '0',
        transcriptCount: 0,
        meanCompositeScore: null,
      },
    });
    const result = await service.check('user-1');
    expect(result.ready).toBe(false);
    expect(reasons(result.blockers)).toContain('Eligible recordings');
  });

  it('points at the exclusion breakdown when recordings exist but none qualify', async () => {
    const { service } = makeService({
      inventory: {
        eligibleCount: 0,
        excludedCount: 12,
        exclusionsByReason: { audio_purged: 12 },
        totalDurationMs: '0',
        transcriptCount: 0,
        meanCompositeScore: null,
      },
    });
    const blocker = (await service.check('user-1')).blockers.find(
      (b) => b.requirement === 'Eligible recordings',
    );
    expect(blocker?.detail).toMatch(/breakdown/i);
  });

  it('blocks a contributor who withdrew, and routes them to support', async () => {
    // Withdrawal is their own decision and is not undone by starting a new
    // draft, so it is not presented as something to click through.
    const { service } = makeService({
      agreement: {
        id: 'a1',
        licenceKey: 'k',
        withdrawnAt: new Date(),
        activeVersionId: null,
      },
    });
    const result = await service.check('user-1');
    const blocker = result.blockers.find((b) =>
      b.requirement.includes('withdrawn'),
    );
    expect(blocker?.actionable).toBe(false);
    expect(blocker?.detail).toMatch(/support/i);
  });

  it('surfaces an existing non-withdrawn agreement without blocking', async () => {
    const { service } = makeService({
      agreement: {
        id: 'a1',
        licenceKey: 'VDCL-NG-IGNG-USER0001',
        withdrawnAt: null,
        activeVersionId: 'v1',
      },
    });
    const result = await service.check('user-1');
    expect(result.ready).toBe(true);
    expect(result.existingAgreement?.activeVersionId).toBe('v1');
  });

  it('reports a missing account without throwing', async () => {
    const { service } = makeService({ user: null });
    const result = await service.check('nope');
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(1);
  });

  it('reports every unmet requirement at once, not just the first', async () => {
    // A checklist that reveals one problem at a time turns a single
    // conversation into several.
    const { service } = makeService({
      user: defaultUser({
        emailVerified: null,
        kycStatus: KycStatus.NOT_STARTED,
      }),
      // No eligible recordings either, so three separate things are wrong.
      inventory: { eligibleCount: 0, excludedCount: 0, dialectTags: [] },
    });
    const result = await service.check('user-1');
    expect(result.blockers.length).toBeGreaterThanOrEqual(3);
  });
});
