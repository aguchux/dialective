import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEventType, StreamDeckVisibility } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService, QualityTier, qualityTierFor } from '../catalogue/catalogue.service';
import { StreamDecksService } from './stream-decks.service';
import { StreamDeckVersioningService } from './stream-deck-versioning.service';
import { SetDeckLicenseDto } from './dto/set-deck-license.dto';
import { OrgActivityService } from '../org-activity/org-activity.service';

const TIER_RANK: Record<QualityTier, number> = { standard: 0, high: 1, premium_verified: 2 };

/**
 * Cross-org deck discovery (doc section 62's "high-confidence dataset
 * packages"): an OWNER/ADMIN/DATASET_MANAGER can mark their own deck
 * PUBLIC, optionally with a DeckLicense another org must accept first.
 * Deliberately narrow access model, confirmed with the product owner:
 * a public deck is browsable and its recordings can be COPIED into a new
 * deck of the browsing org's own, or QUEUED for that org's own
 * validators -- but the browsing org can never call the deck's own
 * manifest/audio endpoints. Streaming access (StreamManifestService,
 * StreamKeyAuthGuard) is completely untouched by this file and stays
 * scoped to organizationId exactly as before.
 */
@Injectable()
export class PublicDecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly decks: StreamDecksService,
    private readonly versioning: StreamDeckVersioningService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  private async getOwnedDeck(organizationId: string, deckId: string) {
    const deck = await this.prisma.streamDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.organizationId !== organizationId) {
      throw new NotFoundException('Stream Deck not found');
    }
    return deck;
  }

  async setVisibility(
    organizationId: string,
    deckId: string,
    actorUserId: string,
    visibility: StreamDeckVisibility,
  ) {
    const before = await this.getOwnedDeck(organizationId, deckId);
    const deck = await this.prisma.streamDeck.update({ where: { id: deckId }, data: { visibility } });
    if (before.visibility !== visibility) {
      void this.orgActivity.record(organizationId, ActivityEventType.DECK_VISIBILITY_CHANGED, actorUserId, {
        deckId,
        previousVisibility: before.visibility,
        newVisibility: visibility,
      });
    }
    return deck;
  }

  async setLicense(organizationId: string, deckId: string, userId: string, dto: SetDeckLicenseDto) {
    await this.getOwnedDeck(organizationId, deckId);
    return this.prisma.deckLicense.upsert({
      where: { deckId },
      update: {
        termsSummary: dto.termsSummary,
        attributionRequired: dto.attributionRequired ?? false,
        redistributionAllowed: dto.redistributionAllowed ?? false,
      },
      create: {
        deckId,
        termsSummary: dto.termsSummary,
        attributionRequired: dto.attributionRequired ?? false,
        redistributionAllowed: dto.redistributionAllowed ?? false,
        createdByUserId: userId,
      },
    });
  }

  async removeLicense(organizationId: string, deckId: string) {
    await this.getOwnedDeck(organizationId, deckId);
    await this.prisma.deckLicense.deleteMany({ where: { deckId } });
  }

  /**
   * Browsable by any subscriber org -- deliberately excludes the caller's
   * OWN decks (nothing to "browse" about your own data) and PRIVATE decks
   * entirely. minQualityTier filters to decks where EVERY current item
   * meets the floor: a "high-confidence" package should be uniformly
   * high-confidence, not merely contain some qualifying recordings.
   */
  async listPublic(callerOrganizationId: string, minQualityTier?: QualityTier) {
    const decks = await this.prisma.streamDeck.findMany({
      where: { visibility: StreamDeckVisibility.PUBLIC, organizationId: { not: callerOrganizationId } },
      include: {
        items: true,
        license: { include: { acceptances: { where: { organizationId: callerOrganizationId } } } },
        organization: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const results = await Promise.all(
      decks.map(async (deck) => {
        const tierBreakdown = await this.tierBreakdown(deck.items.map((i) => i.recordingId));
        return { deck, tierBreakdown };
      }),
    );

    const withTier = results.map(({ deck, tierBreakdown }) => ({
      id: deck.id,
      deckKey: deck.deckKey,
      name: deck.name,
      organizationName: deck.organization.name,
      itemCount: deck._count.items,
      createdAt: deck.createdAt,
      hasLicense: deck.license !== null,
      licenseAccepted: deck.license ? deck.license.acceptances.length > 0 : true,
      license: deck.license
        ? {
            termsSummary: deck.license.termsSummary,
            attributionRequired: deck.license.attributionRequired,
            redistributionAllowed: deck.license.redistributionAllowed,
          }
        : null,
      minQualityTier: tierBreakdown.minTier,
      tierBreakdown: tierBreakdown.counts,
    }));

    if (!minQualityTier) return withTier;
    return withTier.filter((d) => TIER_RANK[d.minQualityTier] >= TIER_RANK[minQualityTier]);
  }

  /** The weakest quality tier present across a deck's items -- an empty deck reports 'standard' (no floor to claim). */
  private async tierBreakdown(recordingIds: string[]): Promise<{
    minTier: QualityTier;
    counts: Record<QualityTier, number>;
  }> {
    const counts: Record<QualityTier, number> = { standard: 0, high: 0, premium_verified: 0 };
    if (recordingIds.length === 0) return { minTier: 'standard', counts };

    const currents = await this.prisma.isvcCurrent.findMany({
      where: { recordingId: { in: recordingIds } },
      include: { aggregation: true },
    });
    const byRecordingId = new Map(currents.map((c) => [c.recordingId, c.aggregation]));

    let minRank = TIER_RANK.premium_verified;
    for (const recordingId of recordingIds) {
      const agg = byRecordingId.get(recordingId);
      const tier = qualityTierFor(agg?.confidence ?? null, agg?.organizationCount ?? null);
      counts[tier]++;
      minRank = Math.min(minRank, TIER_RANK[tier]);
    }
    const minTier = (Object.keys(TIER_RANK) as QualityTier[]).find((t) => TIER_RANK[t] === minRank)!;
    return { minTier, counts };
  }

  private async requireLicenseAcceptedIfAny(callerOrganizationId: string, deckId: string): Promise<void> {
    const license = await this.prisma.deckLicense.findUnique({ where: { deckId } });
    if (!license) return; // no license attached -- nothing to accept
    const accepted = await this.prisma.deckLicenseAcceptance.findUnique({
      where: { licenseId_organizationId: { licenseId: license.id, organizationId: callerOrganizationId } },
    });
    if (!accepted) {
      throw new ForbiddenException('This deck requires accepting its license before use');
    }
  }

  private async getPublicDeck(deckId: string, callerOrganizationId: string) {
    const deck = await this.prisma.streamDeck.findUnique({ where: { id: deckId } });
    if (!deck || deck.visibility !== StreamDeckVisibility.PUBLIC) {
      throw new NotFoundException('Public Stream Deck not found');
    }
    if (deck.organizationId === callerOrganizationId) {
      throw new BadRequestException('This is your own deck');
    }
    return deck;
  }

  async acceptLicense(callerOrganizationId: string, userId: string, deckId: string) {
    const deck = await this.getPublicDeck(deckId, callerOrganizationId);
    const license = await this.prisma.deckLicense.findUnique({ where: { deckId: deck.id } });
    if (!license) {
      throw new BadRequestException('This deck has no license to accept');
    }
    return this.prisma.deckLicenseAcceptance.upsert({
      where: { licenseId_organizationId: { licenseId: license.id, organizationId: callerOrganizationId } },
      update: {},
      create: { licenseId: license.id, organizationId: callerOrganizationId, acceptedByUserId: userId },
    });
  }

  /** Copies a public deck's current eligible recordings into a NEW deck owned by the caller. Never mutates the source deck. */
  async copyToOwnDeck(
    callerOrganizationId: string,
    userId: string,
    deckId: string,
    newDeckName: string,
  ) {
    const deck = await this.getPublicDeck(deckId, callerOrganizationId);
    await this.requireLicenseAcceptedIfAny(callerOrganizationId, deck.id);

    const sourceItems = await this.prisma.streamDeckItem.findMany({ where: { deckId: deck.id } });
    const newDeck = await this.decks.create(callerOrganizationId, userId, { name: newDeckName });

    let copied = 0;
    for (const item of sourceItems) {
      const eligible = await this.catalogue.isEligible(item.recordingId);
      if (!eligible) continue;
      const already = await this.prisma.streamDeckItem.findUnique({
        where: { deckId_recordingId: { deckId: newDeck.id, recordingId: item.recordingId } },
      });
      if (already) continue;
      await this.prisma.streamDeckItem.create({
        data: { deckId: newDeck.id, recordingId: item.recordingId, addedByUserId: userId },
      });
      copied++;
    }
    if (copied > 0) {
      await this.versioning.writeNewVersionIfMaterial(newDeck.id, 'copied_from_public_deck');
    }
    return this.decks.get(callerOrganizationId, newDeck.id);
  }

  /** Queues a public deck's recordings for the caller's OWN validators -- creates ValidationQueueItem rows, never a SubscriberValidation (no scores exist yet). */
  async importToValidationQueue(callerOrganizationId: string, userId: string, deckId: string) {
    const deck = await this.getPublicDeck(deckId, callerOrganizationId);
    await this.requireLicenseAcceptedIfAny(callerOrganizationId, deck.id);

    const sourceItems = await this.prisma.streamDeckItem.findMany({ where: { deckId: deck.id } });
    let queued = 0;
    for (const item of sourceItems) {
      const eligible = await this.catalogue.isEligible(item.recordingId);
      if (!eligible) continue;
      const already = await this.prisma.validationQueueItem.findUnique({
        where: {
          organizationId_recordingId: { organizationId: callerOrganizationId, recordingId: item.recordingId },
        },
      });
      if (already) continue;
      await this.prisma.validationQueueItem.create({
        data: {
          organizationId: callerOrganizationId,
          recordingId: item.recordingId,
          sourceDeckId: deck.id,
          addedByUserId: userId,
        },
      });
      queued++;
    }
    return { queued, alreadyQueued: sourceItems.length - queued };
  }

  async listValidationQueue(organizationId: string) {
    return this.prisma.validationQueueItem.findMany({
      where: { organizationId },
      orderBy: { addedAt: 'desc' },
    });
  }

  async removeFromValidationQueue(organizationId: string, itemId: string) {
    const item = await this.prisma.validationQueueItem.findUnique({ where: { id: itemId } });
    if (!item || item.organizationId !== organizationId) {
      throw new NotFoundException('Validation queue item not found');
    }
    await this.prisma.validationQueueItem.delete({ where: { id: itemId } });
  }
}
