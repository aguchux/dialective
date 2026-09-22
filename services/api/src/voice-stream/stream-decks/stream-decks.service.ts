import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  ActivityEventType,
  StreamDeckType,
  VdclPurpose,
  WebhookEventType,
} from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { StreamDeckVersioningService } from './stream-deck-versioning.service';
import { SmartDeckEvaluatorService } from './smart-deck-evaluator.service';
import { StreamDeckRuleDto } from './dto/stream-deck-rule.dto';
import { WebhookEventService } from '../webhooks/webhook-event.service';
import { OrgActivityService } from '../org-activity/org-activity.service';
import { DeckCoverageService } from '../../vdcl/rights/deck-coverage.service';

/**
 * "DLSD-{country}-{dialect}-{subdialect}-{6 chars}" per the product plan
 * section 9.2 -- GEN when no subdialect was selected, MIX is reserved for a
 * Smart-Deck rule that intentionally spans multiple subdialects (never
 * generated here, only documented as a valid future value).
 */
function generateDeckKey(
  countryCode?: string,
  dialectTag?: string,
  subdialectTag?: string,
): string {
  const country = (countryCode ?? 'GEN').toUpperCase();
  const dialect = (dialectTag ?? 'GEN').toUpperCase();
  const subdialect = (subdialectTag ?? 'GEN').toUpperCase();
  const suffix = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `DLSD-${country}-${dialect}-${subdialect}-${suffix}`;
}

@Injectable()
export class StreamDecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly deckCoverage: DeckCoverageService,
    private readonly versioning: StreamDeckVersioningService,
    private readonly smartDeckEvaluator: SmartDeckEvaluatorService,
    private readonly webhookEvents: WebhookEventService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  async create(
    organizationId: string,
    createdByUserId: string,
    params: {
      name: string;
      type?: StreamDeckType;
      countryCode?: string;
      dialectTag?: string;
      subdialectTag?: string;
      rule?: StreamDeckRuleDto;
    },
  ) {
    const plan = await this.prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (plan?.plan.maxStreamDecks != null) {
      const existingCount = await this.prisma.streamDeck.count({ where: { organizationId } });
      if (existingCount >= plan.plan.maxStreamDecks) {
        throw new ForbiddenException(
          `Your plan allows a maximum of ${plan.plan.maxStreamDecks} Stream Decks`,
        );
      }
    }

    const type = params.type ?? StreamDeckType.MANUAL;
    if (type === StreamDeckType.SMART && !params.rule) {
      throw new BadRequestException('A Smart Deck must be created with a rule');
    }

    const deckKey = generateDeckKey(params.countryCode, params.dialectTag, params.subdialectTag);
    const deck = await this.prisma.streamDeck.create({
      data: {
        deckKey,
        organizationId,
        name: params.name,
        type,
        createdByUserId,
        ...(type === StreamDeckType.SMART && params.rule
          ? { rule: { create: { ...params.rule } } }
          : {}),
      },
    });

    if (type === StreamDeckType.SMART) {
      await this.smartDeckEvaluator.evaluateRule(deck.id);
    }

    void this.webhookEvents.emit(organizationId, WebhookEventType.DECK_CREATED, {
      organization_id: organizationId,
      deck_id: deck.id,
      deck_key: deck.deckKey,
      type: deck.type,
    });
    void this.orgActivity.record(organizationId, ActivityEventType.DECK_CREATED, createdByUserId, {
      deckId: deck.id,
      deckKey: deck.deckKey,
      type: deck.type,
    });

    return deck;
  }

  async list(organizationId: string) {
    return this.prisma.streamDeck.findMany({
      where: { organizationId },
      include: { _count: { select: { items: true } }, rule: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, deckId: string) {
    const deck = await this.prisma.streamDeck.findUnique({
      where: { id: deckId },
      include: { items: { orderBy: { addedAt: 'desc' } }, rule: true, license: true },
    });
    if (!deck || deck.organizationId !== organizationId) {
      throw new NotFoundException('Stream Deck not found');
    }
    return deck;
  }

  async rename(organizationId: string, deckId: string, actorUserId: string, name: string) {
    const before = await this.get(organizationId, deckId);
    const deck = await this.prisma.streamDeck.update({ where: { id: deckId }, data: { name } });
    void this.orgActivity.record(organizationId, ActivityEventType.DECK_RENAMED, actorUserId, {
      deckId,
      previousName: before.name,
      newName: name,
    });
    return deck;
  }

  async remove(organizationId: string, deckId: string, actorUserId: string) {
    const deck = await this.get(organizationId, deckId);
    await this.prisma.streamDeck.delete({ where: { id: deckId } });
    void this.orgActivity.record(organizationId, ActivityEventType.DECK_DELETED, actorUserId, {
      deckId,
      deckKey: deck.deckKey,
      name: deck.name,
    });
  }

  /**
   * The VDCL purposes an org's decks should be measured against: everything
   * its live credentials declare.
   *
   * A deck has no purpose of its own -- it is a collection, and what matters
   * is what the org will actually do with it. Taking the union across
   * credentials means a deck is reported against every use the org has
   * declared somewhere, which is the conservative reading: a clip counted as
   * licensed here is licensed for all of them.
   *
   * An org with no credentials yet gets an empty list, and coverage is then
   * reported as pending rather than as a false 100%.
   */
  private async organizationPurposes(organizationId: string): Promise<VdclPurpose[]> {
    const [keys, clients] = await Promise.all([
      this.prisma.streamApiKey.findMany({
        where: { organizationId, revokedAt: null },
        select: { purposes: true },
      }),
      this.prisma.oAuthClient.findMany({
        where: { organizationId, revokedAt: null },
        select: { purposes: true },
      }),
    ]);
    const all = new Set<VdclPurpose>();
    for (const row of [...keys, ...clients]) {
      for (const purpose of row.purposes) all.add(purpose);
    }
    return [...all];
  }

  /**
   * Licence coverage for a deck, computed per recording and rolled up.
   *
   * A deck is covered by as many VDCLs as it has distinct contributors --
   * never one unified licence -- so this is always computed, never stored.
   */
  async coverage(organizationId: string, deckId: string) {
    await this.get(organizationId, deckId);
    const purposes = await this.organizationPurposes(organizationId);
    return this.deckCoverage.forDeck(deckId, purposes);
  }

  async addItem(organizationId: string, deckId: string, userId: string, recordingId: string) {
    const deck = await this.get(organizationId, deckId);
    if (deck.type === StreamDeckType.SMART) {
      throw new BadRequestException('Smart Deck membership is rule-driven; edit the rule instead');
    }

    const eligible = await this.catalogue.isEligible(recordingId);
    if (!eligible) {
      throw new NotFoundException('Recording not found or not available for Voice Stream');
    }

    const alreadyMember = await this.prisma.streamDeckItem.findUnique({
      where: { deckId_recordingId: { deckId, recordingId } },
    });
    if (alreadyMember) {
      throw new ConflictException('This recording is already in the deck');
    }

    const item = await this.prisma.streamDeckItem.create({
      data: { deckId, recordingId, addedByUserId: userId },
    });
    await this.versioning.writeNewVersionIfMaterial(deckId, 'manual_add');
    void this.webhookEvents.emit(organizationId, WebhookEventType.DECK_ITEM_ADDED, {
      organization_id: organizationId,
      deck_id: deckId,
      recording_id: recordingId,
    });
    void this.orgActivity.record(organizationId, ActivityEventType.DECK_ITEM_ADDED, userId, {
      deckId,
      recordingId,
    });

    // Report the licence status rather than blocking the add. A contributor
    // who has not signed a VDCL yet is a legitimate pending state, and
    // refusing the add would make decks unbuildable during rollout. But
    // adding blind is how a deck's usable coverage gets depleted without
    // anyone noticing until a subscriber's pipeline starts throwing 403s, so
    // the caller always learns where this clip stands.
    const purposes = await this.organizationPurposes(organizationId);
    const licence = await this.deckCoverage.forRecording(recordingId, purposes);

    return { ...item, licence };
  }

  async removeItem(organizationId: string, deckId: string, actorUserId: string, itemId: string) {
    const deck = await this.get(organizationId, deckId);
    if (deck.type === StreamDeckType.SMART) {
      throw new BadRequestException('Smart Deck membership is rule-driven; edit the rule instead');
    }

    const item = await this.prisma.streamDeckItem.findUnique({ where: { id: itemId } });
    if (!item || item.deckId !== deckId) {
      throw new NotFoundException('Deck item not found');
    }
    await this.prisma.streamDeckItem.delete({ where: { id: itemId } });
    await this.versioning.writeNewVersionIfMaterial(deckId, 'manual_remove');
    void this.webhookEvents.emit(organizationId, WebhookEventType.DECK_ITEM_REMOVED, {
      organization_id: organizationId,
      deck_id: deckId,
      recording_id: item.recordingId,
    });
    void this.orgActivity.record(organizationId, ActivityEventType.DECK_ITEM_REMOVED, actorUserId, {
      deckId,
      recordingId: item.recordingId,
    });
  }

  /** Replaces a Smart Deck's rule and immediately re-evaluates it -- a rule edit should show its effect right away, not wait for the next async sweep. */
  async updateRule(organizationId: string, deckId: string, rule: StreamDeckRuleDto) {
    const deck = await this.get(organizationId, deckId);
    if (deck.type !== StreamDeckType.SMART) {
      throw new BadRequestException('Only Smart Decks have a rule');
    }

    await this.prisma.streamDeckRule.upsert({
      where: { deckId },
      update: { ...rule },
      create: { deckId, ...rule },
    });

    await this.smartDeckEvaluator.evaluateRule(deckId);
    return this.get(organizationId, deckId);
  }

  async listVersions(organizationId: string, deckId: string) {
    await this.get(organizationId, deckId);
    return this.prisma.streamDeckVersion.findMany({
      where: { deckId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, itemCount: true, createdAt: true, createdReason: true },
    });
  }
}
