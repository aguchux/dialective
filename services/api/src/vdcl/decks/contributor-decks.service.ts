import { Injectable } from '@nestjs/common';
import { Prisma, SubmissionStatus, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { ELIGIBILITY_SELECT, classify } from '../compilation/eligibility';

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
 * Read-only by design in this pass. Publishing a deck to Stream is NOT a
 * matter of flipping a visibility flag on one of these: a contributor deck
 * is covered by exactly one agreement, so a subscriber browsing it would
 * know every recording in it came from one person -- the precise inference
 * DeckCoverageService suppresses its agreement count to prevent. Publishing
 * therefore has to pool contributions into a multi-contributor dialect deck,
 * which is a separate piece of work with its own anonymity review.
 */
@Injectable()
export class ContributorDecksService {
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
    const [names, uncovered] = await Promise.all([
      this.resolveDialectNames(tags),
      this.countUncovered(contributorId, tags),
    ]);

    const decks: ContributorDeck[] = tags.map((tag) => {
      const bucket = grouped.get(tag)!;
      return {
        dialectTag: tag,
        dialectName: names.get(tag) ?? tag,
        recordingCount: bucket.count,
        totalDurationMs: bucket.durationMs,
        transcriptCount: bucket.transcripts,
        meanCompositeScore:
          bucket.scored > 0 ? Math.round((bucket.scoreSum / bucket.scored) * 100) / 100 : null,
        uncoveredCount: uncovered.get(tag) ?? 0,
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
