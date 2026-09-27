import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  Prisma,
  StreamDeckType,
  StreamDeckVisibility,
  SubmissionStatus,
  VdclVersionStatus,
} from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ELIGIBILITY_SELECT, classify } from '../compilation/eligibility';

/**
 * The seeded singleton SubscriberOrganization every contributor deck is
 * published under, shared with ValidatorDecksService (which defines the same
 * constant for its own bridge). Duplicated rather than imported for the same
 * reason that service duplicates generateDeckKey: importing across module
 * boundaries here would drag a whole unrelated module graph in for one
 * string.
 *
 * Why the platform org owns the deck rather than the contributor: StreamDeck
 * requires an organizationId, and there is deliberately no FK between
 * trainer User and SubscriberUser/SubscriberOrganization -- that boundary is
 * a tenant separation the schema documents at length. Publishing under the
 * platform org gets the deck onto Stream without giving a contributor a
 * subscriber identity, and it has the useful side effect that nothing
 * subscriber-visible carries the contributor's id at all.
 */
export const DIALECT_LIBRARY_PLATFORM_ORG_ID = 'dialect-library-platform';

/** "DLSD-{country}-{dialect}-{subdialect}-{6 chars}" -- same format as StreamDecksService/ValidatorDecksService. */
function generateDeckKey(countryCode?: string | null, dialectTag?: string | null): string {
  const country = (countryCode ?? 'GEN').toUpperCase();
  const dialect = (dialectTag ?? 'GEN').toUpperCase();
  const suffix = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `DLSD-${country}-${dialect}-GEN-${suffix}`;
}

/**
 * One dialect's worth of a contributor's licensed recordings.
 *
 * A contributor who recorded Pidgin and later Igbo holds ONE licence
 * covering both (see VdclAgreement's @@unique([contributorId]) and the
 * comment above it), but two decks -- a deck is a dataset, and the two
 * dialects are different datasets with different buyers.
 */
export interface ContributorDeck {
  dialectTag: string;
  /** Resolved at read time from the Dialect table, falling back to the tag. */
  dialectName: string;
  recordingCount: number;
  totalDurationMs: number;
  transcriptCount: number;
  /** Mean composite across the deck's items, or null when none are scored. */
  meanCompositeScore: number | null;
  /**
   * Recordings in this dialect that are eligible but sit OUTSIDE the signed
   * manifest, because they were made after signing. Not a defect -- the
   * manifest is deliberately frozen -- but the contributor needs to know
   * their newer work is not yet earning, and that signing a new version is
   * what fixes it.
   */
  uncoveredCount: number;
  /**
   * The ContributorDeck row's id once this dialect has been published as a
   * browsable unit, else null. Null does NOT mean the recordings are absent
   * from Stream -- signing the licence is what puts them there. It means only
   * that they are not yet grouped into a named deck a subscriber can browse
   * as one thing.
   */
  deckId: string | null;
  /** The bridged StreamDeck's public key, for display. Null until published. */
  streamDeckKey: string | null;
  publishedAt: Date | null;
}

export interface ContributorDeckList {
  /**
   * Null until a version is ACTIVE. The contributor has no decks before
   * countersignature, which is a different state from having zero decks.
   */
  licenceKey: string | null;
  /** The version the decks were derived from, for display alongside them. */
  version: number | null;
  countersignedAt: Date | null;
  decks: ContributorDeck[];
}

/**
 * Turns a signed VDCL into the decks a contributor actually sees.
 *
 * Derived, never stored. The manifest is already the frozen, hashed record
 * of what is licensed; a second copy of that list in a decks table could
 * disagree with it, and if it did, the stored copy would be wrong by
 * definition. So decks are a view over VdclManifestItem, grouped by the
 * per-item dialectTag that compilation already writes.
 *
 * Signing the licence is what makes recordings available to Stream -- not
 * creating a deck. Every recording in an ACTIVE manifest is already
 * discoverable through the subscriber catalogue, individually, identified by
 * dialect and never by contributor. A deck adds one thing on top of that: the
 * dialect-sized GROUPING, so a subscriber shopping for Igbo can take the set
 * rather than assembling it clip by clip.
 *
 * Publishing is therefore additive and ONE-WAY. `publishDeck` bridges into a
 * PUBLIC StreamDeck under the platform org and there is no unpublish, by
 * design: revoking the licence withdraws subscribers' PERMISSION to use the
 * data (RightsService denies with `licence_withdrawn`, live, on every read),
 * it does not remove recordings from Stream, and re-signing restores access.
 * Presence and permission are separate, and only permission is revocable.
 *
 * Anonymity: a contributor deck is covered by exactly one agreement, so the
 * bridged deck deliberately reports no contributor count and no owner id --
 * the StreamDeck's organizationId is the platform org, not anything traceable
 * to a person. This is the same inference DeckCoverageService suppresses its
 * agreement count below MIN_ITEMS_FOR_AGREEMENT_COUNT to prevent.
 */
@Injectable()
export class ContributorDecksService {
  private readonly logger = new Logger(ContributorDecksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listForContributor(contributorId: string): Promise<ContributorDeckList> {
    const agreement = await this.prisma.vdclAgreement.findUnique({
      where: { contributorId },
      select: {
        licenceKey: true,
        withdrawnAt: true,
        activeVersion: {
          select: {
            version: true,
            status: true,
            countersignedAt: true,
            manifest: {
              select: {
                items: {
                  select: {
                    dialectTag: true,
                    durationMs: true,
                    hasTranscript: true,
                    compositeScore: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const active = agreement?.activeVersion;

    // A withdrawn licence grants nothing going forward, so it shows no
    // decks. Withdrawal is prospective and cannot retract what was already
    // delivered, but this surface is about what the contributor holds NOW.
    if (!agreement || agreement.withdrawnAt || !active || active.status !== VdclVersionStatus.ACTIVE) {
      return { licenceKey: null, version: null, countersignedAt: null, decks: [] };
    }

    const items = active.manifest?.items ?? [];

    const grouped = new Map<
      string,
      { count: number; durationMs: number; transcripts: number; scoreSum: number; scored: number }
    >();

    for (const item of items) {
      const bucket = grouped.get(item.dialectTag) ?? {
        count: 0,
        durationMs: 0,
        transcripts: 0,
        scoreSum: 0,
        scored: 0,
      };
      bucket.count += 1;
      bucket.durationMs += item.durationMs ?? 0;
      if (item.hasTranscript) bucket.transcripts += 1;
      if (item.compositeScore !== null) {
        bucket.scoreSum += Number(item.compositeScore);
        bucket.scored += 1;
      }
      grouped.set(item.dialectTag, bucket);
    }

    const tags = [...grouped.keys()];
    const [names, uncovered, published] = await Promise.all([
      this.resolveDialectNames(tags),
      this.countUncovered(contributorId, tags),
      this.publishedByTag(contributorId),
    ]);

    const decks: ContributorDeck[] = tags.map((tag) => {
      const bucket = grouped.get(tag)!;
      const row = published.get(tag);
      return {
        dialectTag: tag,
        dialectName: names.get(tag) ?? tag,
        recordingCount: bucket.count,
        totalDurationMs: bucket.durationMs,
        transcriptCount: bucket.transcripts,
        meanCompositeScore:
          bucket.scored > 0 ? Math.round((bucket.scoreSum / bucket.scored) * 100) / 100 : null,
        uncoveredCount: uncovered.get(tag) ?? 0,
        deckId: row?.id ?? null,
        streamDeckKey: row?.streamDeckKey ?? null,
        publishedAt: row?.createdAt ?? null,
      };
    });

    // Biggest deck first: the contributor's main dialect is the one they
    // care about, and alphabetical ordering would bury it behind a dialect
    // they recorded twice.
    decks.sort(
      (a, b) => b.recordingCount - a.recordingCount || a.dialectName.localeCompare(b.dialectName),
    );

    return {
      licenceKey: agreement.licenceKey,
      version: active.version,
      countersignedAt: active.countersignedAt,
      decks,
    };
  }

  /**
   * Publish one dialect as a browsable deck on Stream.
   *
   * ONE-WAY, and the copy in the UI says so before the contributor confirms.
   * There is no unpublish method here and that is deliberate, not an
   * omission: withdrawing the licence is the lever that matters, and it
   * revokes subscribers' PERMISSION rather than the deck's existence.
   *
   * One dialect per deck is structural, not validated: membership is derived
   * from the manifest items whose dialectTag equals this deck's tag, so a
   * mixed-dialect deck cannot be expressed. The only check needed is that the
   * tag is one this contributor's ACTIVE manifest actually covers.
   */
  async publishDeck(contributorId: string, dialectTag: string): Promise<ContributorDeck> {
    const list = await this.listForContributor(contributorId);
    if (!list.licenceKey) {
      throw new BadRequestException(
        'You need an active Voice Dataset Contributor Licence before you can publish a deck',
      );
    }

    const deck = list.decks.find((candidate) => candidate.dialectTag === dialectTag);
    if (!deck) {
      throw new NotFoundException(
        'Your licence does not cover any recordings in that dialect',
      );
    }
    if (deck.deckId) {
      throw new ConflictException('That dialect is already published as a deck');
    }
    if (deck.recordingCount === 0) {
      // Defensive: a tag only appears in the grouping because items carry it,
      // so this should be unreachable. An empty deck on Stream would be a
      // broken shelf, so it is still refused rather than trusted.
      throw new BadRequestException('There are no licensed recordings in that dialect to publish');
    }

    // The recordings this deck is built from: exactly the ACTIVE manifest's
    // items for this one dialect. Read here rather than carried down from
    // listForContributor because the StreamDeckItem rows need ids, not counts.
    // Scoped to the version the AGREEMENT points at, not merely to one whose
    // status reads ACTIVE. RightsService applies the same extra condition for
    // the same reason: the agreement's own pointer is authoritative, and a
    // stale manifest row left pointing at a version the agreement has since
    // moved off must not contribute items to a deck.
    const items = await this.prisma.vdclManifestItem.findMany({
      where: {
        dialectTag,
        manifest: {
          vdclVersion: {
            status: VdclVersionStatus.ACTIVE,
            agreement: { contributorId, withdrawnAt: null },
            activeFor: { contributorId },
          },
        },
      },
      select: { recordingId: true },
      // activeFor above already narrows to one manifest, whose
      // @@unique([manifestId, recordingId]) makes ids distinct -- but
      // StreamDeckItem's own @@unique([deckId, recordingId]) would make a
      // duplicate a failed publish rather than a deduplicated one, so this
      // does not lean on an invariant two constraints away.
      distinct: ['recordingId'],
    });
    if (items.length === 0) {
      throw new BadRequestException('There are no licensed recordings in that dialect to publish');
    }

    const countryCode = await this.resolveCountryCode(dialectTag);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const streamDeck = await tx.streamDeck.create({
          data: {
            deckKey: generateDeckKey(countryCode, dialectTag),
            organizationId: DIALECT_LIBRARY_PLATFORM_ORG_ID,
            name: deck.dialectName,
            type: StreamDeckType.MANUAL,
            // The contributor is the creator in provenance terms, but this
            // column is read as a SubscriberUser id everywhere else in
            // Voice Stream, and a trainer id here would be both wrong and a
            // quiet identity leak into a subscriber-facing surface. The
            // platform org id stands in; the real provenance link is
            // ContributorDeck.ownerUserId, which Stream never reads.
            createdByUserId: DIALECT_LIBRARY_PLATFORM_ORG_ID,
            visibility: StreamDeckVisibility.PUBLIC,
          },
        });

        await tx.streamDeckItem.createMany({
          data: items.map((item) => ({
            deckId: streamDeck.id,
            recordingId: item.recordingId,
            addedByUserId: DIALECT_LIBRARY_PLATFORM_ORG_ID,
          })),
        });

        const row = await tx.contributorDeck.create({
          data: {
            ownerUserId: contributorId,
            dialectTag,
            name: deck.dialectName,
            streamDeckId: streamDeck.id,
            itemCount: items.length,
          },
        });

        return { row, deckKey: streamDeck.deckKey };
      });

      this.logger.log(
        `Contributor deck published dialect=${dialectTag} items=${items.length} streamDeck=${created.deckKey}`,
      );

      return {
        ...deck,
        deckId: created.row.id,
        streamDeckKey: created.deckKey,
        publishedAt: created.row.createdAt,
      };
    } catch (err) {
      // The @@unique([ownerUserId, dialectTag]) is the real guard against a
      // double publish -- the deckId check above can lose a race between two
      // taps. Translating it here means the second tap reports "already
      // published" rather than a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That dialect is already published as a deck');
      }
      throw err;
    }
  }

  /**
   * Published decks for this contributor, keyed by dialect tag.
   *
   * Joined to the StreamDeck only for its public key, which is the identifier
   * a subscriber would quote back. A row whose bridged deck has since been
   * deleted still counts as published -- the ContributorDeck row is the
   * contributor-side record, and reporting it as unpublished would invite a
   * second publish of the same dialect.
   */
  private async publishedByTag(
    contributorId: string,
  ): Promise<Map<string, { id: string; streamDeckKey: string | null; createdAt: Date }>> {
    const rows = await this.prisma.contributorDeck.findMany({
      where: { ownerUserId: contributorId },
      select: { id: true, dialectTag: true, streamDeckId: true, createdAt: true },
    });
    if (rows.length === 0) return new Map();

    const deckIds = rows.map((row) => row.streamDeckId).filter((id): id is string => id !== null);
    const keys = deckIds.length
      ? await this.prisma.streamDeck.findMany({
          where: { id: { in: deckIds } },
          select: { id: true, deckKey: true },
        })
      : [];
    const keyById = new Map(keys.map((deck) => [deck.id, deck.deckKey]));

    return new Map(
      rows.map((row) => [
        row.dialectTag,
        {
          id: row.id,
          streamDeckKey: row.streamDeckId ? keyById.get(row.streamDeckId) ?? null : null,
          createdAt: row.createdAt,
        },
      ]),
    );
  }

  /** For the deck key's country segment. Display-only, same as the name. */
  private async resolveCountryCode(dialectTag: string): Promise<string | null> {
    const dialect = await this.prisma.dialect.findFirst({
      where: { tag: dialectTag },
      select: { country: { select: { code: true } } },
    });
    return dialect?.country?.code ?? null;
  }

  /**
   * Names for display only. The manifest stores TAGS and the licence hash is
   * computed over them, so a renamed dialect must not change what an issued
   * licence verifies against -- names resolve at render time, exactly as
   * VdclDocumentsService does it for the certificate.
   */
  private async resolveDialectNames(tags: string[]): Promise<Map<string, string>> {
    if (tags.length === 0) return new Map();
    const rows = await this.prisma.dialect.findMany({
      where: { tag: { in: tags } },
      select: { tag: true, name: true },
    });
    return new Map(rows.map((row) => [row.tag, row.name]));
  }

  /**
   * Eligible recordings per dialect that the signed manifest does not cover.
   *
   * Counted through the same `classify` the compiler uses, not a looser
   * "everything terminal" query. If this used different rules it would
   * promise coverage the next compilation would not deliver -- telling a
   * contributor that signing again adds 12 recordings when it would add 4 is
   * worse than saying nothing.
   */
  private async countUncovered(
    contributorId: string,
    tags: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (tags.length === 0) return result;

    const covered = await this.prisma.vdclManifestItem.findMany({
      where: { manifest: { vdclVersion: { agreement: { contributorId } } } },
      select: { recordingId: true },
    });
    const coveredIds = new Set(covered.map((row) => row.recordingId));

    const candidates = await this.prisma.wordRecording.findMany({
      where: {
        userId: contributorId,
        dialectTag: { in: tags },
        status: { not: SubmissionStatus.PENDING },
      },
      select: ELIGIBILITY_SELECT,
    });

    for (const candidate of candidates) {
      if (coveredIds.has(candidate.id)) continue;
      if (!classify(candidate, { contributorId }).eligible) continue;
      result.set(candidate.dialectTag, (result.get(candidate.dialectTag) ?? 0) + 1);
    }

    return result;
  }
}
