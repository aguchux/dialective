import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { RightsService } from './rights.service';

/**
 * The rights check is the whole of VDCL Phase 0, and it is a DENY gate on
 * commercial use -- so the cases that matter most are the ones where it must
 * refuse. Every test here asserts a refusal reason, not just a boolean, since
 * the reason string is written verbatim into StreamAccessLog and is what makes
 * an enforcement decision explainable after the fact.
 */
describe('RightsService.mayUse', () => {
  const AGREEMENT_ID = 'agreement-1';
  const VERSION_ID = 'version-1';
  const RECORDING_ID = 'recording-1';

  function buildItem(overrides: {
    status?: VdclVersionStatus;
    withdrawnAt?: Date | null;
    activeVersionId?: string | null;
    purposes?: VdclPurpose[];
    versionId?: string;
  }) {
    const versionId = overrides.versionId ?? VERSION_ID;
    return {
      recordingId: RECORDING_ID,
      manifest: {
        versionId,
        vdclVersion: {
          id: versionId,
          status: overrides.status ?? VdclVersionStatus.ACTIVE,
          agreementId: AGREEMENT_ID,
          agreement: {
            id: AGREEMENT_ID,
            withdrawnAt: overrides.withdrawnAt ?? null,
            activeVersionId:
              overrides.activeVersionId === undefined ? versionId : overrides.activeVersionId,
          },
          grants: (overrides.purposes ?? [VdclPurpose.ASR_TRAINING]).map((purpose) => ({
            purpose,
          })),
        },
      },
    };
  }

  function makeService(items: unknown[], enforcementEnabled = true) {
    const prisma = {
      vdclManifestItem: { findMany: jest.fn().mockResolvedValue(items) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const settings = {
      isVdclEnforcementEnabled: jest.fn().mockResolvedValue(enforcementEnabled),
    };
    return {
      service: new RightsService(prisma as never, settings as never),
      prisma,
      settings,
    };
  }

  it('denies a recording with no VDCL at all -- fail closed is the default', async () => {
    const { service } = makeService([]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('no_vdcl');
    expect(decision.entitlementDecision).toBe('denied:no_vdcl');
  });

  it('allows a recording covered by an ACTIVE version granting the purpose', async () => {
    const { service } = makeService([buildItem({ purposes: [VdclPurpose.ASR_TRAINING] })]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(true);
    expect(decision.entitlementDecision).toBe('allowed');
    expect(decision.agreementId).toBe(AGREEMENT_ID);
    expect(decision.versionId).toBe(VERSION_ID);
  });

  it('denies a purpose the contributor did not grant', async () => {
    const { service } = makeService([buildItem({ purposes: [VdclPurpose.ASR_TRAINING] })]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.VOICE_CLONING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('purpose_not_granted');
  });

  it('denies after withdrawal even though the version is still ACTIVE', async () => {
    // Withdrawal is the contributor's own decision and must take effect for
    // new access immediately, ahead of any other status.
    const { service } = makeService([buildItem({ withdrawnAt: new Date() })]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_withdrawn');
  });

  it('denies a suspended licence', async () => {
    const { service } = makeService([buildItem({ status: VdclVersionStatus.SUSPENDED })]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_suspended');
  });

  it.each([
    VdclVersionStatus.DRAFT,
    VdclVersionStatus.PENDING_COMPILATION,
    VdclVersionStatus.PENDING_REVIEW,
    VdclVersionStatus.PENDING_COUNTERSIGNATURE,
    VdclVersionStatus.SUPERSEDED,
    VdclVersionStatus.WITHDRAWN,
    VdclVersionStatus.REJECTED,
    VdclVersionStatus.AMENDMENT_PENDING,
  ])('denies a version in %s -- only ACTIVE grants rights', async (status) => {
    const { service } = makeService([buildItem({ status })]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_not_active');
  });

  it('denies when the agreement has moved off this version', async () => {
    // A stale manifest must never keep granting rights after the agreement
    // has pointed its active version elsewhere.
    const { service } = makeService([buildItem({ activeVersionId: 'some-newer-version' })]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_not_active');
  });

  it('allows when any one of several covering versions grants the purpose', async () => {
    // A recording can sit in successive manifests; one valid grant is enough.
    const { service } = makeService([
      buildItem({ versionId: 'old', status: VdclVersionStatus.SUPERSEDED, activeVersionId: 'new' }),
      buildItem({ versionId: 'new', purposes: [VdclPurpose.TTS_TRAINING] }),
    ]);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.TTS_TRAINING);
    expect(decision.allowed).toBe(true);
    expect(decision.versionId).toBe('new');
  });

  it('returns allowed without querying when enforcement is disabled', async () => {
    const { service, prisma } = makeService([], false);
    const decision = await service.mayUse(RECORDING_ID, VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(true);
    // The kill switch must short-circuit entirely -- shipping dark means
    // costing nothing, including a query per streamed clip.
    expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
  });
});

describe('RightsService.mayUseMany', () => {
  function makeService(items: unknown[], enforcementEnabled = true) {
    const prisma = {
      vdclManifestItem: { findMany: jest.fn().mockResolvedValue(items) },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const settings = {
      isVdclEnforcementEnabled: jest.fn().mockResolvedValue(enforcementEnabled),
    };
    return { service: new RightsService(prisma as never, settings as never), prisma };
  }

  function item(recordingId: string, purposes: VdclPurpose[]) {
    return {
      recordingId,
      manifest: {
        vdclVersion: {
          id: `v-${recordingId}`,
          status: VdclVersionStatus.ACTIVE,
          agreementId: `a-${recordingId}`,
          agreement: { withdrawnAt: null, activeVersionId: `v-${recordingId}` },
          grants: purposes.map((purpose) => ({ purpose })),
        },
      },
    };
  }

  it('denies every recordingId absent from the manifest table', async () => {
    const { service } = makeService([item('covered', [VdclPurpose.ASR_TRAINING])]);
    const result = await service.mayUseMany(
      ['covered', 'uncovered'],
      VdclPurpose.ASR_TRAINING,
    );
    expect(result.get('covered')?.allowed).toBe(true);
    expect(result.get('uncovered')?.allowed).toBe(false);
    expect(result.get('uncovered')?.reason).toBe('no_vdcl');
  });

  it('returns an empty map for an empty input without querying', async () => {
    const { service, prisma } = makeService([]);
    const result = await service.mayUseMany([], VdclPurpose.ASR_TRAINING);
    expect(result.size).toBe(0);
    expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
  });

  it('allows everything when enforcement is disabled', async () => {
    const { service, prisma } = makeService([], false);
    const result = await service.mayUseMany(['a', 'b'], VdclPurpose.ASR_TRAINING);
    expect(result.get('a')?.allowed).toBe(true);
    expect(result.get('b')?.allowed).toBe(true);
    expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
  });
});

describe('RightsService.recordDecision', () => {
  it('never throws when the audit write fails', async () => {
    // An audit failure must not turn an allowed stream into a 500.
    const prisma = {
      vdclManifestItem: { findMany: jest.fn() },
      vdclAuditEvent: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    };
    const settings = { isVdclEnforcementEnabled: jest.fn().mockResolvedValue(true) };
    const service = new RightsService(prisma as never, settings as never);

    await expect(
      service.recordDecision({
        recordingId: 'r1',
        purpose: VdclPurpose.ASR_TRAINING,
        decision: { allowed: false, reason: 'no_vdcl', entitlementDecision: 'denied:no_vdcl' },
      }),
    ).resolves.toBeUndefined();
  });
});
