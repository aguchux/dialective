import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { StreamDeckType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { StreamDeckVersioningService } from './stream-deck-versioning.service';
import { SmartDeckEvaluatorService } from './smart-deck-evaluator.service';
import { StreamDeckRuleDto } from './dto/stream-deck-rule.dto';

/**
 * "DLSD-{country}-{dialect}-{subdialect}-{6 chars}" per the product plan
 * section 9.2 -- GEN when no subdialect was selected, MIX is reserved for a
 * Smart-Deck rule that intentionally spans multiple subdialects (never
 * generated here, only documented as a valid future value).
 */
function generateDeckKey(countryCode?: string, dialectTag?: string, subdialectTag?: string): string {
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
    private readonly versioning: StreamDeckVersioningService,
    private readonly smartDeckEvaluator: SmartDeckEvaluatorService,
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
      include: { items: { orderBy: { addedAt: 'desc' } }, rule: true },
    });
    if (!deck || deck.organizationId !== organizationId) {
      throw new NotFoundException('Stream Deck not found');
    }
    return deck;
  }

  async rename(organizationId: string, deckId: string, name: string) {
    await this.get(organizationId, deckId);
    return this.prisma.streamDeck.update({ where: { id: deckId }, data: { name } });
  }

  async remove(organizationId: string, deckId: string) {
    await this.get(organizationId, deckId);
    await this.prisma.streamDeck.delete({ where: { id: deckId } });
  }

  async addItem(organizationId: string, deckId: string, userId: string, recordingId: string) {
    const deck = await this.get(organizationId, deckId);
    if (deck.type === StreamDeckType.SMART) {
      throw new BadRequestException(
        'Smart Deck membership is rule-driven; edit the rule instead',
      );
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
    return item;
  }

  async removeItem(organizationId: string, deckId: string, itemId: string) {
    const deck = await this.get(organizationId, deckId);
    if (deck.type === StreamDeckType.SMART) {
      throw new BadRequestException(
        'Smart Deck membership is rule-driven; edit the rule instead',
      );
    }

    const item = await this.prisma.streamDeckItem.findUnique({ where: { id: itemId } });
    if (!item || item.deckId !== deckId) {
      throw new NotFoundException('Deck item not found');
    }
    await this.prisma.streamDeckItem.delete({ where: { id: itemId } });
    await this.versioning.writeNewVersionIfMaterial(deckId, 'manual_remove');
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
