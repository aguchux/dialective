import { kindKey } from '../../voice-stream/stream-record-kind.util';
import { StreamRecordKind, VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { RightsService } from './rights.service';

/**
 * The rights check is the whole of VDCL Phase 0, and it is a DENY gate on
 * commercial use -- so the cases that matter most are the ones where it must
 * refuse. Every test here asserts a refusal reason, not just a boolean, since
 * the reason string is written verbatim into StreamAccessLog and is what makes
 * an enforcement decision explainable after the fact.
 */
/**
 * Shorthand for a record reference. Every rights entry point takes (kind, id)
 * rather than a bare id -- the two record tables have independent uuid spaces.
 */
function ref(
  recordingId: string,
  recordKind: StreamRecordKind = StreamRecordKind.WORD_RECORDING,
) {
  return { recordKind, recordingId };
}

/** The composite map key the batch methods return. */
function key(
  recordingId: string,
  recordKind: StreamRecordKind = StreamRecordKind.WORD_RECORDING,
) {
  return kindKey(recordKind, recordingId);
}

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
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('no_vdcl');
    expect(decision.entitlementDecision).toBe('denied:no_vdcl');
  });

  it('allows a recording covered by an ACTIVE version granting the purpose', async () => {
    const { service } = makeService([buildItem({ purposes: [VdclPurpose.ASR_TRAINING] })]);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(true);
    expect(decision.entitlementDecision).toBe('allowed');
    expect(decision.agreementId).toBe(AGREEMENT_ID);
    expect(decision.versionId).toBe(VERSION_ID);
  });

  it('denies a purpose the contributor did not grant', async () => {
    const { service } = makeService([buildItem({ purposes: [VdclPurpose.ASR_TRAINING] })]);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.VOICE_CLONING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('purpose_not_granted');
  });

  it('denies after withdrawal even though the version is still ACTIVE', async () => {
    // Withdrawal is the contributor's own decision and must take effect for
    // new access immediately, ahead of any other status.
    const { service } = makeService([buildItem({ withdrawnAt: new Date() })]);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_withdrawn');
  });

  it('denies a suspended licence', async () => {
    const { service } = makeService([buildItem({ status: VdclVersionStatus.SUSPENDED })]);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
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
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_not_active');
  });

  it('denies when the agreement has moved off this version', async () => {
    // A stale manifest must never keep granting rights after the agreement
    // has pointed its active version elsewhere.
    const { service } = makeService([buildItem({ activeVersionId: 'some-newer-version' })]);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('licence_not_active');
  });

  it('allows when any one of several covering versions grants the purpose', async () => {
    // A recording can sit in successive manifests; one valid grant is enough.
    const { service } = makeService([
      buildItem({ versionId: 'old', status: VdclVersionStatus.SUPERSEDED, activeVersionId: 'new' }),
      buildItem({ versionId: 'new', purposes: [VdclPurpose.TTS_TRAINING] }),
    ]);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.TTS_TRAINING);
    expect(decision.allowed).toBe(true);
    expect(decision.versionId).toBe('new');
  });

  it('returns allowed without querying when enforcement is disabled', async () => {
    const { service, prisma } = makeService([], false);
    const decision = await service.mayUse(ref(RECORDING_ID), VdclPurpose.ASR_TRAINING);
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
      recordKind: StreamRecordKind.WORD_RECORDING,
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

  it('denies every record absent from the manifest table', async () => {
    const { service } = makeService([item('covered', [VdclPurpose.ASR_TRAINING])]);
    const result = await service.mayUseMany(
      [ref('covered'), ref('uncovered')],
      VdclPurpose.ASR_TRAINING,
    );
    // Keyed by (kind, id), not bare id.
    expect(result.get(key('covered'))?.allowed).toBe(true);
    expect(result.get(key('uncovered'))?.allowed).toBe(false);
    expect(result.get(key('uncovered'))?.reason).toBe('no_vdcl');
  });

  it('does not let one record kind answer for another sharing its uuid', async () => {
    // The reason every rights entry point takes (kind, id). A licensed word
    // recording must not vouch for an unlicensed domain conversation that
    // happens to share its uuid -- that would be a confidently wrong answer to
    // a rights question, which is worse than no answer.
    const shared = 'same-uuid';
    const { service } = makeService([item(shared, [VdclPurpose.ASR_TRAINING])]);

    const result = await service.mayUseMany(
      [
        ref(shared, StreamRecordKind.WORD_RECORDING),
        ref(shared, StreamRecordKind.DOMAIN_CONVERSATION_RECORDING),
      ],
      VdclPurpose.ASR_TRAINING,
    );

    expect(result.get(key(shared, StreamRecordKind.WORD_RECORDING))?.allowed).toBe(true);
    expect(
      result.get(key(shared, StreamRecordKind.DOMAIN_CONVERSATION_RECORDING))?.allowed,
    ).toBe(false);
  });

  it('scopes the manifest query by kind, not by id alone', async () => {
    const { service, prisma } = makeService([]);
    await service.mayUseMany(
      [ref('a'), ref('b', StreamRecordKind.DOMAIN_CONVERSATION_RECORDING)],
      VdclPurpose.ASR_TRAINING,
    );

    // One OR term per kind present -- an id-only `in` would match the other
    // table's rows too.
    const where = prisma.vdclManifestItem.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR.map((t: { recordKind: string }) => t.recordKind).sort()).toEqual([
      'DOMAIN_CONVERSATION_RECORDING',
      'WORD_RECORDING',
    ]);
  });

  it('returns an empty map for an empty input without querying', async () => {
    const { service, prisma } = makeService([]);
    const result = await service.mayUseMany([], VdclPurpose.ASR_TRAINING);
    expect(result.size).toBe(0);
    expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
  });

  it('allows everything when enforcement is disabled', async () => {
    const { service, prisma } = makeService([], false);
    const result = await service.mayUseMany([ref('a'), ref('b')], VdclPurpose.ASR_TRAINING);
    expect(result.get(key('a'))?.allowed).toBe(true);
    expect(result.get(key('b'))?.allowed).toBe(true);
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

/**
 * Purpose-aware enforcement is what makes itemised consent real rather than
 * decorative. Recording the grants faithfully and then checking a single
 * hardcoded purpose at the gate would let a subscriber stream data for a use
 * the contributor explicitly refused.
 */
describe('RightsService.mayUseForCredential', () => {
  const RECORDING_ID = 'recording-1';

  function makeService(grantedPurposes: VdclPurpose[], enforcementEnabled = true) {
    const prisma = {
      vdclManifestItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            recordingId: RECORDING_ID,
            manifest: {
              versionId: 'v1',
              vdclVersion: {
                id: 'v1',
                status: VdclVersionStatus.ACTIVE,
                agreementId: 'a1',
                agreement: { id: 'a1', withdrawnAt: null, activeVersionId: 'v1' },
                grants: grantedPurposes.map((purpose) => ({ purpose })),
              },
            },
          },
        ]),
      },
      vdclAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const settings = {
      isVdclEnforcementEnabled: jest.fn().mockResolvedValue(enforcementEnabled),
    };
    return { service: new RightsService(prisma as never, settings as never), prisma };
  }

  it('denies a credential that declares no purpose at all', async () => {
    // Undeclared must be denied, never defaulted -- guessing a purpose on the
    // subscriber's behalf is exactly the hole this closes.
    const { service } = makeService([VdclPurpose.ASR_TRAINING]);
    const decision = await service.mayUseForCredential(ref(RECORDING_ID), { purposes: [] });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('no_declared_purpose');
  });

  it('allows when the declared purpose is granted', async () => {
    const { service } = makeService([VdclPurpose.ASR_TRAINING]);
    const decision = await service.mayUseForCredential(ref(RECORDING_ID), {
      purposes: [VdclPurpose.ASR_TRAINING],
    });
    expect(decision.allowed).toBe(true);
  });

  it('denies a TTS key against an ASR-only grant -- the case that matters', async () => {
    // A contributor granted speech recognition training and nothing else.
    // A subscriber whose key declares speech synthesis must be refused.
    const { service } = makeService([VdclPurpose.ASR_TRAINING]);
    const decision = await service.mayUseForCredential(ref(RECORDING_ID), {
      purposes: [VdclPurpose.TTS_TRAINING],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('purpose_not_granted');
  });

  it('requires ALL declared purposes, not any', async () => {
    // A key declaring both ASR and TTS against an ASR-only grant is refused:
    // otherwise one granted purpose would smuggle in every refused one.
    const { service } = makeService([VdclPurpose.ASR_TRAINING]);
    const decision = await service.mayUseForCredential(ref(RECORDING_ID), {
      purposes: [VdclPurpose.ASR_TRAINING, VdclPurpose.TTS_TRAINING],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('purpose_not_granted');
  });

  it('allows a multi-purpose key when every declared purpose is granted', async () => {
    const { service } = makeService([
      VdclPurpose.ASR_TRAINING,
      VdclPurpose.TTS_TRAINING,
      VdclPurpose.LLM_TRAINING,
    ]);
    const decision = await service.mayUseForCredential(ref(RECORDING_ID), {
      purposes: [VdclPurpose.ASR_TRAINING, VdclPurpose.TTS_TRAINING],
    });
    expect(decision.allowed).toBe(true);
  });

  it('allows an undeclared credential while enforcement is off', async () => {
    const { service } = makeService([], false);
    const decision = await service.mayUseForCredential(ref(RECORDING_ID), { purposes: [] });
    expect(decision.allowed).toBe(true);
  });
});

describe('RightsService.filterUsableForCredential', () => {
  function makeService(grantsByRecording: Record<string, VdclPurpose[]>, enabled = true) {
    const rows = Object.entries(grantsByRecording).map(([recordingId, purposes]) => ({
      recordKind: StreamRecordKind.WORD_RECORDING as StreamRecordKind,
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
    }));
    const prisma = {
      vdclManifestItem: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          // Mirrors the real query shape: an OR of per-kind terms, so the mock
          // would break if the service went back to an id-only `in`.
          const terms: { recordKind: string; recordingId: { in: string[] } }[] = where.OR;
          return Promise.resolve(
            rows.filter((r) =>
              terms.some(
                (t) => t.recordKind === r.recordKind && t.recordingId.in.includes(r.recordingId),
              ),
            ),
          );
        }),
      },
      vdclAuditEvent: { create: jest.fn() },
    };
    const settings = { isVdclEnforcementEnabled: jest.fn().mockResolvedValue(enabled) };
    return { service: new RightsService(prisma as never, settings as never) };
  }

  it('returns only the recordings licensed for the declared purpose', async () => {
    // Partial coverage is the NORMAL case: a deck's recordings come from
    // different contributors who granted different things.
    const { service } = makeService({
      'rec-a': [VdclPurpose.ASR_TRAINING, VdclPurpose.TTS_TRAINING],
      'rec-b': [VdclPurpose.ASR_TRAINING],
      'rec-c': [],
    });
    const usable = await service.filterUsableForCredential([ref('rec-a'), ref('rec-b'), ref('rec-c')], {
      purposes: [VdclPurpose.TTS_TRAINING],
    });
    // Composite keys, not bare ids -- see kindKey.
    expect([...usable]).toEqual([key('rec-a')]);
  });

  it('returns nothing for an undeclared credential', async () => {
    const { service } = makeService({ 'rec-a': [VdclPurpose.ASR_TRAINING] });
    const usable = await service.filterUsableForCredential([ref('rec-a')], { purposes: [] });
    expect(usable.size).toBe(0);
  });

  it('returns everything untouched while enforcement is off', async () => {
    const { service } = makeService({}, false);
    const usable = await service.filterUsableForCredential([ref('rec-a'), ref('rec-b')], { purposes: [] });
    expect([...usable].sort()).toEqual([key('rec-a'), key('rec-b')].sort());
  });
});
