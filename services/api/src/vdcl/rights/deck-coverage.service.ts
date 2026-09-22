import { Injectable } from '@nestjs/common';
import { VdclPurpose, VdclVersionStatus } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';

/**
 * Why a recording in a deck is not streamable for a given purpose. Mirrors
 * RightsService's denial reasons, but aggregated -- the deck view needs to
 * distinguish "nobody has signed yet" (a pending state that will resolve)
 * from "the contributor withdrew" (a permanent loss), because those call for
 * completely different actions from the org holding the deck.
 */
export interface DeckCoverageBreakdown {
  /** Streamable right now for every purpose asked about. */
  licensed: number;
  /** No VDCL covers the recording yet -- may resolve when the contributor signs. */
  pending: number;
  /** A licence exists but does not grant one of the requested purposes. */
  purposeNotGranted: number;
  /** The contributor withdrew. Prospective, and it does not come back. */
  withdrawn: number;
  /** Dialect Library suspended the licence (dispute, compliance review). */
  suspended: number;
}

export interface DeckCoverage {
  deckId: string;
  purposes: VdclPurpose[];
  /** Every recording in the deck, licensed or not. */
  totalItems: number;
  breakdown: DeckCoverageBreakdown;
  /** licensed / totalItems, 0-100, one decimal. 100 means fully covered. */
  coveragePercent: number;
  /**
   * How many distinct contributor agreements this deck draws on. A deck is
   * never covered by one licence -- its recordings come from many
   * contributors, each with their own VDCL and their own withdrawal right.
   * Surfacing the count is what stops an org reading a deck as a single
   * licensed asset.
   *
   * NULL on small decks. Subscribers must never be able to work out that
   * two recordings share an owner: on a 5,000-item deck the count reveals
   * nothing, but on a 3-item deck "1 agreement" tells the subscriber all
   * three came from the same contributor, which combined with dialect and
   * subdialect can be narrowing in a small community. Suppressed below
   * MIN_ITEMS_FOR_AGREEMENT_COUNT rather than reported exactly.
   */
  contributingAgreements: number | null;
  /** True when enforcement is off -- coverage is then advisory, not binding. */
  advisory: boolean;
}

/**
 * Below this many items, the contributing-agreement count is suppressed --
 * see the field's doc comment. Chosen as a conservative floor rather than a
 * tuned one: the cost of suppressing on a slightly-too-large deck is an
 * absent number, and the cost of reporting on a too-small one is a
 * contributor's recordings becoming linkable.
 */
const MIN_ITEMS_FOR_AGREEMENT_COUNT = 20;

const EMPTY_BREAKDOWN: DeckCoverageBreakdown = {
  licensed: 0,
  pending: 0,
  purposeNotGranted: 0,
  withdrawn: 0,
  suspended: 0,
};

/**
 * Deck-level licence coverage, computed from per-recording rights.
 *
 * A Stream Deck has NO licence of its own. An org building a private deck
 * pulls recordings from many contributors, so the deck is covered by as many
 * VDCLs as it has distinct contributors -- each independently grantable,
 * suspendable and withdrawable. Coverage is therefore always a computed
 * roll-up of individual answers, never a fact stored on the deck. Storing it
 * would be the same mistake as assuming a deck has one licence.
 *
 * This is what a subscriber needs BEFORE they build a pipeline: a deck that
 * is 82% licensed for TTS is a different commercial proposition from one
 * that is 100% licensed, and discovering the difference as 403s partway
 * through a training run is not an acceptable way to learn it.
 */
@Injectable()
export class DeckCoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async forDeck(deckId: string, purposes: VdclPurpose[]): Promise<DeckCoverage> {
    const items = await this.prisma.streamDeckItem.findMany({
      where: { deckId },
      select: { recordingId: true },
    });
    const recordingIds = items.map((i) => i.recordingId);
    const coverage = await this.forRecordings(recordingIds, purposes);
    return { ...coverage, deckId };
  }

  /**
   * The same roll-up over an arbitrary recording set, so a deck preview (or
   * a "what would this rule select?" check) can report coverage before any
   * item is actually written.
   */
  async forRecordings(
    recordingIds: string[],
    purposes: VdclPurpose[],
  ): Promise<Omit<DeckCoverage, 'deckId'>> {
    const enforcementOn = await this.settings.isVdclEnforcementEnabled();

    if (recordingIds.length === 0) {
      return {
        purposes,
        totalItems: 0,
        breakdown: { ...EMPTY_BREAKDOWN },
        coveragePercent: 100,
        contributingAgreements: null,
        advisory: !enforcementOn,
      };
    }

    const rows = await this.prisma.vdclManifestItem.findMany({
      where: { recordingId: { in: recordingIds } },
      select: {
        recordingId: true,
        manifest: {
          select: {
            vdclVersion: {
              select: {
                id: true,
                status: true,
                agreementId: true,
                agreement: { select: { withdrawnAt: true, activeVersionId: true } },
                grants: { select: { purpose: true } },
              },
            },
          },
        },
      },
    });

    const byRecording = new Map<string, typeof rows>();
    const agreementIds = new Set<string>();
    for (const row of rows) {
      const list = byRecording.get(row.recordingId) ?? [];
      list.push(row);
      byRecording.set(row.recordingId, list);
      agreementIds.add(row.manifest.vdclVersion.agreementId);
    }

    const breakdown = { ...EMPTY_BREAKDOWN };

    for (const recordingId of recordingIds) {
      const covering = byRecording.get(recordingId);
      if (!covering || covering.length === 0) {
        breakdown.pending++;
        continue;
      }

      // A recording can sit in several manifests (successive versions, or an
      // amendment). Classify by the BEST outcome available: if any covering
      // version grants every requested purpose, the recording is licensed.
      let best: keyof DeckCoverageBreakdown = 'pending';
      const rank: Record<keyof DeckCoverageBreakdown, number> = {
        licensed: 4,
        purposeNotGranted: 3,
        suspended: 2,
        withdrawn: 1,
        pending: 0,
      };
      const promote = (candidate: keyof DeckCoverageBreakdown) => {
        if (rank[candidate] > rank[best]) best = candidate;
      };

      for (const row of covering) {
        const version = row.manifest.vdclVersion;
        if (version.agreement.withdrawnAt) {
          promote('withdrawn');
          continue;
        }
        if (version.status === VdclVersionStatus.SUSPENDED) {
          promote('suspended');
          continue;
        }
        if (
          version.status !== VdclVersionStatus.ACTIVE ||
          version.agreement.activeVersionId !== version.id
        ) {
          promote('pending');
          continue;
        }
        const granted = new Set(version.grants.map((g) => g.purpose));
        // All requested purposes must be granted, matching
        // RightsService.mayUseForCredential's all-not-any rule.
        if (purposes.length > 0 && purposes.every((p) => granted.has(p))) {
          promote('licensed');
        } else {
          promote('purposeNotGranted');
        }
      }

      breakdown[best]++;
    }

    const totalItems = recordingIds.length;
    return {
      purposes,
      totalItems,
      breakdown,
      coveragePercent:
        totalItems === 0 ? 100 : Number(((breakdown.licensed / totalItems) * 100).toFixed(1)),
      contributingAgreements:
        totalItems >= MIN_ITEMS_FOR_AGREEMENT_COUNT ? agreementIds.size : null,
      advisory: !enforcementOn,
    };
  }

  /**
   * Licence status for ONE recording, for the add-to-deck response.
   *
   * An org adding an unlicensed recording is not blocked -- a contributor
   * who has not signed yet is a legitimate pending state, and blocking would
   * make decks unbuildable during rollout. But they must not add blind,
   * because a deck quietly accumulating unlicensed items is exactly how its
   * usable coverage gets depleted without anyone noticing.
   */
  async forRecording(
    recordingId: string,
    purposes: VdclPurpose[],
  ): Promise<{ status: keyof DeckCoverageBreakdown; advisory: boolean }> {
    const coverage = await this.forRecordings([recordingId], purposes);
    const status = (Object.keys(coverage.breakdown) as (keyof DeckCoverageBreakdown)[]).find(
      (key) => coverage.breakdown[key] === 1,
    );
    return { status: status ?? 'pending', advisory: coverage.advisory };
  }
}
