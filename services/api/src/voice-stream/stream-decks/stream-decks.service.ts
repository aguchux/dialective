import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';

/**
 * "DLSD-{country}-{dialect}-{subdialect}-{6 chars}" per the product plan
 * section 9.2 -- GEN when no subdialect was selected, MIX is reserved for a
 * later Smart-Deck rule that intentionally spans multiple subdialects
 * (Phase 1 only builds manual decks, so MIX is never generated here, only
 * documented as a valid future value).
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
  ) {}

  async create(
    organizationId: string,
    createdByUserId: string,
    params: { name: string; countryCode?: string; dialectTag?: string; subdialectTag?: string },
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

    const deckKey = generateDeckKey(params.countryCode, params.dialectTag, params.subdialectTag);
    return this.prisma.streamDeck.create({
      data: {
        deckKey,
        organizationId,
        name: params.name,
        createdByUserId,
      },
    });
  }

  async list(organizationId: string) {
    return this.prisma.streamDeck.findMany({
      where: { organizationId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, deckId: string) {
    const deck = await this.prisma.streamDeck.findUnique({
      where: { id: deckId },
      include: { items: { orderBy: { addedAt: 'desc' } } },
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
    await this.get(organizationId, deckId);

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

    return this.prisma.streamDeckItem.create({
      data: { deckId, recordingId, addedByUserId: userId },
    });
  }

  async removeItem(organizationId: string, deckId: string, itemId: string) {
    await this.get(organizationId, deckId);
    const item = await this.prisma.streamDeckItem.findUnique({ where: { id: itemId } });
    if (!item || item.deckId !== deckId) {
      throw new NotFoundException('Deck item not found');
    }
    await this.prisma.streamDeckItem.delete({ where: { id: itemId } });
  }
}
