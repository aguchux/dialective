import { Test } from '@nestjs/testing';
import { Prisma, SubmissionStatus, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ContributorDecksService } from './contributor-decks.service';

const CONTRIBUTOR = 'contributor-1';

function manifestItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    dialectTag: 'ig',
    durationMs: 3000,
    hasTranscript: true,
    compositeScore: new Prisma.Decimal('80'),
    ...overrides,
  };
}

/** A recording shaped like ELIGIBILITY_SELECT, eligible unless overridden. */
function recording(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rec-1',
    userId: CONTRIBUTOR,
    dialectTag: 'ig',
    status: SubmissionStatus.SCORED,
    score: new Prisma.Decimal('80'),
    compositeScore: new Prisma.Decimal('80'),
    durationMs: 3000,
    transcript: 'hello',
    audioKey: 'audio/rec-1.webm',
    audioDeletedAt: null,
    misplacedDialectAt: null,
    noAudioClawedBackAt: null,
    ...overrides,
  };
}

describe('ContributorDecksService', () => {
  let service: ContributorDecksService;
  let prisma: {
    vdclAgreement: { findUnique: jest.Mock };
    vdclManifestItem: { findMany: jest.Mock };
    wordRecording: { findMany: jest.Mock };
    dialect: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      vdclAgreement: { findUnique: jest.fn() },
      vdclManifestItem: { findMany: jest.fn().mockResolvedValue([]) },
      wordRecording: { findMany: jest.fn().mockResolvedValue([]) },
      dialect: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ContributorDecksService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ContributorDecksService);
  });

  function withActiveVersion(items: ReturnType<typeof manifestItem>[]) {
    prisma.vdclAgreement.findUnique.mockResolvedValue({
      licenceKey: 'VDCL-NG-29730152',
      withdrawnAt: null,
      activeVersion: {
        version: 2,
        status: VdclVersionStatus.ACTIVE,
        countersignedAt: new Date('2026-09-01T00:00:00Z'),
        manifest: { items },
      },
    });
  }

  it('produces one deck per dialect the contributor recorded', async () => {
    // The motivating case from the request: Pidgin then Igbo, one licence,
    // two decks.
    withActiveVersion([
      manifestItem({ dialectTag: 'pcm' }),
      manifestItem({ dialectTag: 'pcm' }),
      manifestItem({ dialectTag: 'ig' }),
    ]);
    prisma.dialect.findMany.mockResolvedValue([
      { tag: 'pcm', name: 'Nigerian Pidgin' },
      { tag: 'ig', name: 'Igbo' },
    ]);

    const result = await service.listForContributor(CONTRIBUTOR);

    expect(result.decks).toHaveLength(2);
    // Largest first, so the contributor's main dialect leads.
    expect(result.decks[0]).toMatchObject({
      dialectTag: 'pcm',
      dialectName: 'Nigerian Pidgin',
      recordingCount: 2,
    });
    expect(result.decks[1]).toMatchObject({ dialectTag: 'ig', recordingCount: 1 });
    expect(result.licenceKey).toBe('VDCL-NG-29730152');
    expect(result.version).toBe(2);
  });

  it('aggregates duration, transcripts and mean score per deck', async () => {
    withActiveVersion([
      manifestItem({ durationMs: 1000, hasTranscript: true, compositeScore: new Prisma.Decimal('90') }),
      manifestItem({ durationMs: 2000, hasTranscript: false, compositeScore: new Prisma.Decimal('70') }),
    ]);

    const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

    expect(deck.totalDurationMs).toBe(3000);
    expect(deck.transcriptCount).toBe(1);
    expect(deck.meanCompositeScore).toBe(80);
  });

  it('reports no mean score when nothing in the deck is scored', async () => {
    withActiveVersion([manifestItem({ compositeScore: null })]);

    const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

    // Not 0 -- an unscored deck and a deck scoring zero are different facts.
    expect(deck.meanCompositeScore).toBeNull();
  });

  it('falls back to the tag when a dialect has no name row', async () => {
    withActiveVersion([manifestItem({ dialectTag: 'zzz' })]);
    prisma.dialect.findMany.mockResolvedValue([]);

    const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

    expect(deck.dialectName).toBe('zzz');
  });

  it('shows no decks before a version is countersigned', async () => {
    // PENDING_COUNTERSIGNATURE is signed but not in force. Showing decks
    // here would tell the contributor they hold something they do not.
    prisma.vdclAgreement.findUnique.mockResolvedValue({
      licenceKey: 'VDCL-NG-29730152',
      withdrawnAt: null,
      activeVersion: null,
    });

    const result = await service.listForContributor(CONTRIBUTOR);

    expect(result.decks).toEqual([]);
    expect(result.licenceKey).toBeNull();
  });

  it('shows no decks once the contributor has withdrawn', async () => {
    prisma.vdclAgreement.findUnique.mockResolvedValue({
      licenceKey: 'VDCL-NG-29730152',
      withdrawnAt: new Date('2026-09-10T00:00:00Z'),
      activeVersion: {
        version: 1,
        status: VdclVersionStatus.ACTIVE,
        countersignedAt: new Date('2026-09-01T00:00:00Z'),
        manifest: { items: [manifestItem()] },
      },
    });

    expect((await service.listForContributor(CONTRIBUTOR)).decks).toEqual([]);
  });

  it('shows no decks when the contributor has no agreement at all', async () => {
    prisma.vdclAgreement.findUnique.mockResolvedValue(null);

    const result = await service.listForContributor(CONTRIBUTOR);

    expect(result).toEqual({ licenceKey: null, version: null, countersignedAt: null, decks: [] });
  });

  it('counts eligible recordings made after signing as uncovered', async () => {
    withActiveVersion([manifestItem()]);
    prisma.vdclManifestItem.findMany.mockResolvedValue([{ recordingId: 'covered-1' }]);
    prisma.wordRecording.findMany.mockResolvedValue([
      recording({ id: 'covered-1' }),
      recording({ id: 'new-1' }),
      recording({ id: 'new-2' }),
    ]);

    const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

    // Only the two not already in a manifest.
    expect(deck.uncoveredCount).toBe(2);
  });

  it('does not count ineligible recordings as uncovered', async () => {
    // Promising coverage the next compilation would not deliver is worse
    // than staying quiet -- these fail the same `classify` the compiler uses.
    withActiveVersion([manifestItem()]);
    prisma.wordRecording.findMany.mockResolvedValue([
      recording({ id: 'purged', audioDeletedAt: new Date(), audioKey: null }),
      recording({ id: 'misplaced', misplacedDialectAt: new Date() }),
      recording({ id: 'no-audio', noAudioClawedBackAt: new Date() }),
      recording({ id: 'someone-else', userId: 'other-user' }),
    ]);

    const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

    expect(deck.uncoveredCount).toBe(0);
  });

  it('attributes uncovered recordings to their own dialect', async () => {
    withActiveVersion([manifestItem({ dialectTag: 'ig' }), manifestItem({ dialectTag: 'pcm' })]);
    prisma.wordRecording.findMany.mockResolvedValue([
      recording({ id: 'new-ig', dialectTag: 'ig' }),
      recording({ id: 'new-pcm-1', dialectTag: 'pcm' }),
      recording({ id: 'new-pcm-2', dialectTag: 'pcm' }),
    ]);

    const decks = (await service.listForContributor(CONTRIBUTOR)).decks;
    const byTag = new Map(decks.map((deck) => [deck.dialectTag, deck]));

    expect(byTag.get('ig')!.uncoveredCount).toBe(1);
    expect(byTag.get('pcm')!.uncoveredCount).toBe(2);
  });
});
