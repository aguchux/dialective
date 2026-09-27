import { Test } from '@nestjs/testing';
import { Prisma, SubmissionStatus, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ContributorDecksService,
  DIALECT_LIBRARY_PLATFORM_ORG_ID,
} from './contributor-decks.service';

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
    dialect: { findMany: jest.Mock; findFirst: jest.Mock };
    contributorDeck: { findMany: jest.Mock; create: jest.Mock };
    streamDeck: { findMany: jest.Mock; create: jest.Mock };
    streamDeckItem: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      vdclAgreement: { findUnique: jest.fn() },
      vdclManifestItem: { findMany: jest.fn().mockResolvedValue([]) },
      wordRecording: { findMany: jest.fn().mockResolvedValue([]) },
      dialect: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ country: { code: 'NG' } }),
      },
      // No published decks by default, so the existing listing assertions
      // stay about grouping rather than publication state.
      contributorDeck: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      streamDeck: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      streamDeckItem: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // Runs the callback against the same mock, so a publish's writes are
      // observable on the mocks above.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
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

  describe('publishDeck', () => {
    /** The manifest rows publishDeck reads to build StreamDeckItems. */
    function withManifestRecordings(ids: string[]) {
      prisma.vdclManifestItem.findMany.mockImplementation((args: any) => {
        // countUncovered asks for recordingIds across every version;
        // publishDeck asks for one dialect's items on the ACTIVE version.
        if (args?.where?.dialectTag) {
          return Promise.resolve(ids.map((id) => ({ recordingId: id })));
        }
        return Promise.resolve([]);
      });
    }

    beforeEach(() => {
      prisma.contributorDeck.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'deck-row-1', createdAt: new Date('2026-09-27T00:00:00Z') }),
      );
      prisma.streamDeck.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'stream-deck-1' }),
      );
    });

    it('bridges into a PUBLIC StreamDeck owned by the platform org', async () => {
      // The whole point of the platform org: a contributor deck must reach
      // Stream without a trainer id appearing on a subscriber-facing row,
      // since there is no FK between User and SubscriberUser at all.
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);
      prisma.dialect.findMany.mockResolvedValue([{ tag: 'ig', name: 'Igbo' }]);
      withManifestRecordings(['rec-1', 'rec-2']);

      await service.publishDeck(CONTRIBUTOR, 'ig');

      const deckArgs = prisma.streamDeck.create.mock.calls[0][0].data;
      expect(deckArgs.organizationId).toBe(DIALECT_LIBRARY_PLATFORM_ORG_ID);
      expect(deckArgs.visibility).toBe('PUBLIC');
      expect(deckArgs.createdByUserId).not.toBe(CONTRIBUTOR);
    });

    it('adds exactly the manifest items for that one dialect', async () => {
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);
      withManifestRecordings(['rec-1', 'rec-2']);

      await service.publishDeck(CONTRIBUTOR, 'ig');

      const items = prisma.streamDeckItem.createMany.mock.calls[0][0].data;
      expect(items.map((i: any) => i.recordingId)).toEqual(['rec-1', 'rec-2']);
      // One dialect per deck is the invariant the whole feature rests on.
      expect(prisma.vdclManifestItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ dialectTag: 'ig' }) }),
      );
    });

    it('refuses a dialect the licence does not cover', async () => {
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);

      await expect(service.publishDeck(CONTRIBUTOR, 'yo')).rejects.toThrow(
        /does not cover any recordings/i,
      );
      expect(prisma.streamDeck.create).not.toHaveBeenCalled();
    });

    it('refuses to publish without an active licence', async () => {
      // Signing is what makes recordings available; there is nothing to group
      // into a deck before that.
      prisma.vdclAgreement.findUnique.mockResolvedValue(null);

      await expect(service.publishDeck(CONTRIBUTOR, 'ig')).rejects.toThrow(/active Voice Dataset/i);
      expect(prisma.streamDeck.create).not.toHaveBeenCalled();
    });

    it('refuses a second publish of the same dialect', async () => {
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);
      withManifestRecordings(['rec-1']);
      prisma.contributorDeck.findMany.mockResolvedValue([
        {
          id: 'deck-row-1',
          dialectTag: 'ig',
          streamDeckId: 'stream-deck-1',
          createdAt: new Date(),
        },
      ]);
      prisma.streamDeck.findMany.mockResolvedValue([
        { id: 'stream-deck-1', deckKey: 'DLSD-NG-IG-GEN-ABC123' },
      ]);

      await expect(service.publishDeck(CONTRIBUTOR, 'ig')).rejects.toThrow(/already published/i);
      expect(prisma.streamDeck.create).not.toHaveBeenCalled();
    });

    it('translates a unique-constraint race into "already published"', async () => {
      // The deckId check above can lose a race between two taps; the unique
      // index is the real guard, and the second tap must not 500.
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);
      withManifestRecordings(['rec-1']);
      prisma.contributorDeck.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '7',
        }),
      );

      await expect(service.publishDeck(CONTRIBUTOR, 'ig')).rejects.toThrow(/already published/i);
    });

    it('reports published state back on the deck listing', async () => {
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);
      prisma.contributorDeck.findMany.mockResolvedValue([
        {
          id: 'deck-row-1',
          dialectTag: 'ig',
          streamDeckId: 'stream-deck-1',
          createdAt: new Date('2026-09-27T00:00:00Z'),
        },
      ]);
      prisma.streamDeck.findMany.mockResolvedValue([
        { id: 'stream-deck-1', deckKey: 'DLSD-NG-IG-GEN-ABC123' },
      ]);

      const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

      expect(deck.deckId).toBe('deck-row-1');
      expect(deck.streamDeckKey).toBe('DLSD-NG-IG-GEN-ABC123');
      expect(deck.publishedAt).toEqual(new Date('2026-09-27T00:00:00Z'));
    });

    it('leaves unpublished dialects null rather than absent', async () => {
      // Null deckId means "not grouped into a browsable deck", NOT "not on
      // Stream" -- signing already put the recordings there.
      withActiveVersion([manifestItem({ dialectTag: 'ig' })]);

      const [deck] = (await service.listForContributor(CONTRIBUTOR)).decks;

      expect(deck.deckId).toBeNull();
      expect(deck.streamDeckKey).toBeNull();
      expect(deck.publishedAt).toBeNull();
    });
  });
});
