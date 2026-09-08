import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ValidatorDeckStatus } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CreateValidatorDeckDto } from './dto/create-validator-deck.dto';
import { UpdateValidatorDeckDto } from './dto/update-validator-deck.dto';
import { ScoreValidatorDeckItemDto } from './dto/score-validator-deck-item.dto';

/**
 * Phase 1 (docs/validators.md): DRAFT-only deck lifecycle -- any validator
 * can view any deck (mirrors "other validators can view all private decks"
 * from the plan), but only the deck's owner (or an admin) may edit it.
 * There is deliberately no visibility flag like StreamDeck's PRIVATE/PUBLIC:
 * *edit* rights are scoped, not *read* rights. Submit/approve/reject/publish
 * land in a later phase -- every deck stays DRAFT here.
 */
@Injectable()
export class ValidatorDecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async create(ownerUserId: string, dto: CreateValidatorDeckDto) {
    return this.prisma.validatorDeck.create({
      data: {
        name: dto.name,
        dialectTag: dto.dialectTag,
        countryCode: dto.countryCode,
        createdByUserId: ownerUserId,
        ownerUserId,
      },
    });
  }

  async list(filter: 'mine' | 'all', callerUserId: string) {
    return this.prisma.validatorDeck.findMany({
      where: filter === 'mine' ? { ownerUserId: callerUserId } : undefined,
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(deckId: string) {
    const deck = await this.prisma.validatorDeck.findUnique({
      where: { id: deckId },
      include: { items: { orderBy: { addedAt: 'desc' } } },
    });
    if (!deck) throw new NotFoundException('Validator deck not found');
    return deck;
  }

  /** With the expected-earning preview -- validatedCount x flat rate, never persisted. */
  async getWithPreview(deckId: string) {
    const deck = await this.get(deckId);
    const validCount = deck.items.filter((item) => item.validationStatus === 'VALID').length;
    const rate = await this.settings.getValidationRewardPerRecording();
    return { ...deck, expectedEarning: (validCount * rate).toString() };
  }

  async update(deckId: string, callerUserId: string, callerRole: string, dto: UpdateValidatorDeckDto) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);
    return this.prisma.validatorDeck.update({
      where: { id: deck.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.dialectTag !== undefined ? { dialectTag: dto.dialectTag } : {}),
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
      },
    });
  }

  async addItem(deckId: string, callerUserId: string, callerRole: string, recordingId: string) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);

    const recording = await this.prisma.wordRecording.findUnique({ where: { id: recordingId } });
    if (!recording) throw new NotFoundException('Recording not found');

    const existing = await this.prisma.validatorDeckItem.findUnique({
      where: { deckId_recordingId: { deckId: deck.id, recordingId } },
    });
    if (existing) throw new ConflictException('This recording is already in the deck');

    const maxItems = await this.settings.getValidatorDeckMaxItems();
    if (maxItems > 0) {
      const currentCount = await this.prisma.validatorDeckItem.count({ where: { deckId: deck.id } });
      if (currentCount >= maxItems) {
        throw new ForbiddenException(`This deck already has the maximum of ${maxItems} recordings`);
      }
    }

    return this.prisma.validatorDeckItem.create({
      data: { deckId: deck.id, recordingId, addedByUserId: callerUserId },
    });
  }

  async removeItem(deckId: string, callerUserId: string, callerRole: string, recordingId: string) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);
    const item = await this.prisma.validatorDeckItem.findUnique({
      where: { deckId_recordingId: { deckId: deck.id, recordingId } },
    });
    if (!item) throw new NotFoundException('This recording is not in the deck');
    await this.prisma.validatorDeckItem.delete({ where: { id: item.id } });
  }

  async scoreItem(
    deckId: string,
    callerUserId: string,
    callerRole: string,
    recordingId: string,
    dto: ScoreValidatorDeckItemDto,
  ) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);
    const item = await this.prisma.validatorDeckItem.findUnique({
      where: { deckId_recordingId: { deckId: deck.id, recordingId } },
    });
    if (!item) throw new NotFoundException('This recording is not in the deck');

    return this.prisma.validatorDeckItem.update({
      where: { id: item.id },
      data: {
        validationStatus: dto.status,
        validatorScore: dto.score ?? null,
        validatorNotes: dto.notes ?? null,
        scoredAt: new Date(),
      },
    });
  }

  /** Shared ownership gate: any validator can read (see class doc comment), only the owner or an admin can mutate, and only while the deck is still DRAFT. */
  private async assertEditable(deckId: string, callerUserId: string, callerRole: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    if (deck.ownerUserId !== callerUserId && callerRole !== 'ADMIN') {
      throw new ForbiddenException('Only the deck owner or an admin can edit this deck');
    }
    if (deck.status !== ValidatorDeckStatus.DRAFT) {
      throw new BadRequestException('Only a draft deck can be edited');
    }
    return deck;
  }
}
