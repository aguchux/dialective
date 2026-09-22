import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { DeckCoverageService } from './deck-coverage.service';

/**
 * A Stream Deck has no licence of its own. An org building a private deck
 * pulls recordings from many contributors, so the deck is covered by as many
 * VDCLs as it has distinct contributors -- each independently grantable,
 * suspendable and withdrawable.
 *
 * These tests pin down that a deck's coverage is always a computed roll-up
 * of those individual answers, and that the breakdown distinguishes states
 * calling for different actions: "pending" resolves when a contributor
 * signs, "withdrawn" does not.
 */
describe('DeckCoverageService', () => {
  function manifestRow(
    recordingId: string,
    opts: {
      agreementId?: string;
      purposes?: VdclPurpose[];
      status?: VdclVersionStatus;
      withdrawnAt?: Date | null;
      activeVersionId?: string | null;
    } = {},
  ) {
    const versionId = `v-${recordingId}`;
    return {
      recordingId,
      manifest: {
        vdclVersion: {
          id: versionId,
          status: opts.status ?? VdclVersionStatus.ACTIVE,
          agreementId: opts.agreementId ?? `a-${recordingId}`,
          agreement: {
            withdrawnAt: opts.withdrawnAt ?? null,
            activeVersionId:
              opts.activeVersionId === undefined ? versionId : opts.activeVersionId,
          },
          grants: (opts.purposes ?? [VdclPurpose.ASR_TRAINING]).map((purpose) => ({ purpose })),
        },
      },
    };
  }

  function makeService(rows: unknown[], deckItems: string[] = [], enforcementOn = true) {
    const prisma = {
      streamDeckItem: {
        findMany: jest.fn().mockResolvedValue(deckItems.map((recordingId) => ({ recordingId }))),
      },
      vdclManifestItem: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const wanted: string[] = where.recordingId.in;
          return Promise.resolve(
            (rows as { recordingId: string }[]).filter((r) => wanted.includes(r.recordingId)),
          );
        }),
      },
    };
    const settings = {
      isVdclEnforcementEnabled: jest.fn().mockResolvedValue(enforcementOn),
    };
    return { service: new DeckCoverageService(prisma as never, settings as never), prisma };
  }

  it('rolls up a deck drawing on several contributors, each with their own licence', async () => {
    // The case that matters: one deck, four contributors, four separate
    // VDCLs, four different outcomes.
    const rows = [
      manifestRow('rec-ok', { agreementId: 'a1', purposes: [VdclPurpose.ASR_TRAINING] }),
      manifestRow('rec-wrong-purpose', { agreementId: 'a2', purposes: [VdclPurpose.TTS_TRAINING] }),
      manifestRow('rec-withdrawn', { agreementId: 'a3', withdrawnAt: new Date() }),
      manifestRow('rec-suspended', {
        agreementId: 'a4',
        status: VdclVersionStatus.SUSPENDED,
      }),
      // rec-unsigned has no manifest row at all
    ];
    const items = [
      'rec-ok',
      'rec-wrong-purpose',
      'rec-withdrawn',
      'rec-suspended',
      'rec-unsigned',
    ];
    const { service } = makeService(rows, items);

    const coverage = await service.forDeck('deck-1', [VdclPurpose.ASR_TRAINING]);

    expect(coverage.totalItems).toBe(5);
    expect(coverage.breakdown).toEqual({
      licensed: 1,
      purposeNotGranted: 1,
      withdrawn: 1,
      suspended: 1,
      pending: 1,
    });
    expect(coverage.coveragePercent).toBe(20);
    // Four distinct contributor agreements feed this one deck -- the number
    // that stops an org reading it as a single licensed asset.
    expect(coverage.contributingAgreements).toBe(4);
  });

  it('counts a recording with no VDCL as pending, not as a hard failure', async () => {
    // A contributor who has not signed yet is a state that resolves. It must
    // not be conflated with a withdrawal, which does not.
    const { service } = makeService([], ['rec-1']);
    const coverage = await service.forDeck('deck-1', [VdclPurpose.ASR_TRAINING]);
    expect(coverage.breakdown.pending).toBe(1);
    expect(coverage.breakdown.withdrawn).toBe(0);
  });

  it('requires every requested purpose, matching the stream-time rule', async () => {
    const { service } = makeService(
      [manifestRow('rec-1', { purposes: [VdclPurpose.ASR_TRAINING] })],
      ['rec-1'],
    );
    const coverage = await service.forDeck('deck-1', [
      VdclPurpose.ASR_TRAINING,
      VdclPurpose.TTS_TRAINING,
    ]);
    expect(coverage.breakdown.licensed).toBe(0);
    expect(coverage.breakdown.purposeNotGranted).toBe(1);
  });

  it('takes the best outcome when a recording sits in several manifests', async () => {
    // Successive versions of the same agreement both cover the clip; one
    // grants the purpose, so the clip is licensed.
    const superseded = manifestRow('rec-1', {
      agreementId: 'a1',
      purposes: [VdclPurpose.LLM_TRAINING],
      status: VdclVersionStatus.SUPERSEDED,
      activeVersionId: 'v-new',
    });
    const current = {
      ...manifestRow('rec-1', { agreementId: 'a1', purposes: [VdclPurpose.ASR_TRAINING] }),
    };
    const { service } = makeService([superseded, current], ['rec-1']);

    const coverage = await service.forDeck('deck-1', [VdclPurpose.ASR_TRAINING]);
    expect(coverage.breakdown.licensed).toBe(1);
    expect(coverage.totalItems).toBe(1);
  });

  it('reports an empty deck as fully covered rather than dividing by zero', async () => {
    const { service } = makeService([], []);
    const coverage = await service.forDeck('deck-1', [VdclPurpose.ASR_TRAINING]);
    expect(coverage.totalItems).toBe(0);
    expect(coverage.coveragePercent).toBe(100);
  });

  it('reports nothing as licensed when the org declared no purposes', async () => {
    // No declared purpose means nothing is streamable, so coverage must not
    // read as a false 100%.
    const { service } = makeService([manifestRow('rec-1')], ['rec-1']);
    const coverage = await service.forDeck('deck-1', []);
    expect(coverage.breakdown.licensed).toBe(0);
    expect(coverage.coveragePercent).toBe(0);
  });

  it('flags coverage as advisory while enforcement is off', async () => {
    // The numbers are still computed and still true -- they just are not
    // binding yet, and the caller needs to know which.
    const { service } = makeService([manifestRow('rec-1')], ['rec-1'], false);
    const coverage = await service.forDeck('deck-1', [VdclPurpose.ASR_TRAINING]);
    expect(coverage.advisory).toBe(true);
  });

  describe('forRecording', () => {
    it('reports an unlicensed clip as pending at add time', async () => {
      const { service } = makeService([]);
      const result = await service.forRecording('rec-1', [VdclPurpose.ASR_TRAINING]);
      expect(result.status).toBe('pending');
    });

    it('reports a licensed clip as licensed', async () => {
      const { service } = makeService([
        manifestRow('rec-1', { purposes: [VdclPurpose.ASR_TRAINING] }),
      ]);
      const result = await service.forRecording('rec-1', [VdclPurpose.ASR_TRAINING]);
      expect(result.status).toBe('licensed');
    });

    it('distinguishes a withdrawal from an unsigned contributor', async () => {
      const { service } = makeService([manifestRow('rec-1', { withdrawnAt: new Date() })]);
      const result = await service.forRecording('rec-1', [VdclPurpose.ASR_TRAINING]);
      expect(result.status).toBe('withdrawn');
    });
  });
});
