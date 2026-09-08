import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ValidatorDeckAuditAction, ValidatorDeckStatus, ValidatorLevel } from '@dialectiva/db';
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
 * *edit* rights are scoped, not *read* rights.
 *
 * Phase 2 adds the full approval-chain state machine (submit/approve/reject)
 * plus the append-only ValidatorDeckAuditLog. Decks can reach APPROVED here
 * -- publish (the StreamDeck bridge + VALIDATION_REWARD payout) is Phase 3
 * and out of scope; nothing in this service writes PUBLISHED/REASSIGNED.
 */
@Injectable()
export class ValidatorDecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async create(ownerUserId: string, dto: CreateValidatorDeckDto) {
    return this.prisma.$transaction(async (tx) => {
      const deck = await tx.validatorDeck.create({
        data: {
          name: dto.name,
          dialectTag: dto.dialectTag,
          countryCode: dto.countryCode,
          createdByUserId: ownerUserId,
          ownerUserId,
        },
      });
      await tx.validatorDeckAuditLog.create({
        data: {
          deckId: deck.id,
          action: ValidatorDeckAuditAction.CREATED,
          actorUserId: ownerUserId,
          toStatus: deck.status,
        },
      });
      return deck;
    });
  }

  async list(filter: 'mine' | 'all' | 'pendingMyApproval', callerUserId: string) {
    if (filter === 'pendingMyApproval') {
      return this.listPendingMyApproval(callerUserId);
    }
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

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.validatorDeckItem.create({
        data: { deckId: deck.id, recordingId, addedByUserId: callerUserId },
      });
      await tx.validatorDeckAuditLog.create({
        data: {
          deckId: deck.id,
          action: ValidatorDeckAuditAction.ITEM_ADDED,
          actorUserId: callerUserId,
          metadata: { recordingId },
        },
      });
      return item;
    });
  }

  async removeItem(deckId: string, callerUserId: string, callerRole: string, recordingId: string) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);
    const item = await this.prisma.validatorDeckItem.findUnique({
      where: { deckId_recordingId: { deckId: deck.id, recordingId } },
    });
    if (!item) throw new NotFoundException('This recording is not in the deck');
    await this.prisma.$transaction(async (tx) => {
      await tx.validatorDeckItem.delete({ where: { id: item.id } });
      await tx.validatorDeckAuditLog.create({
        data: {
          deckId: deck.id,
          action: ValidatorDeckAuditAction.ITEM_REMOVED,
          actorUserId: callerUserId,
          metadata: { recordingId },
        },
      });
    });
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

  /**
   * First submission (fromStatus DRAFT) or resubmission after rejection
   * (fromStatus REJECTED). Snapshots the caller's CURRENT validatorLevel
   * (read fresh from DB, not a JWT claim -- levels can change between
   * submissions) as `submittedAtLevel` and routes to the next tier that
   * must review a deck created at that level, per the "climb every level
   * above the creator" rule: L1 -> PENDING_L2, L2 -> PENDING_L3,
   * L3 -> PENDING_ADMIN. Re-submitting after a reject re-snapshots and
   * re-routes using the caller's level at THAT moment -- a promoted or
   * demoted validator's resubmission is a new submission event.
   */
  async submit(deckId: string, callerUserId: string, callerRole: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    if (deck.ownerUserId !== callerUserId && callerRole !== 'ADMIN') {
      throw new ForbiddenException('Only the deck owner or an admin can submit this deck');
    }
    if (deck.status !== ValidatorDeckStatus.DRAFT && deck.status !== ValidatorDeckStatus.REJECTED) {
      throw new BadRequestException('Only a draft or rejected deck can be submitted');
    }

    const caller = await this.prisma.user.findUnique({
      where: { id: callerUserId },
      select: { validatorLevel: true },
    });
    const submittedAtLevel = caller?.validatorLevel ?? ValidatorLevel.L1;
    const toStatus = this.nextPendingStatusForLevel(submittedAtLevel);
    const fromStatus = deck.status;
    const isResubmission = fromStatus === ValidatorDeckStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.validatorDeck.updateMany({
        where: { id: deckId, status: fromStatus },
        data: { status: toStatus },
      });
      if (result.count !== 1) {
        throw new ConflictException('This deck was changed by someone else -- reload and try again');
      }

      if (!isResubmission) {
        const alreadyCreated = await tx.validatorDeckAuditLog.findFirst({
          where: { deckId, action: ValidatorDeckAuditAction.CREATED },
          select: { id: true },
        });
        if (!alreadyCreated) {
          await tx.validatorDeckAuditLog.create({
            data: {
              deckId,
              action: ValidatorDeckAuditAction.CREATED,
              actorUserId: deck.createdByUserId,
              toStatus: ValidatorDeckStatus.DRAFT,
            },
          });
        }
      }

      await tx.validatorDeckAuditLog.create({
        data: {
          deckId,
          action: isResubmission ? ValidatorDeckAuditAction.RESUBMITTED : ValidatorDeckAuditAction.SUBMITTED,
          actorUserId: callerUserId,
          fromStatus,
          toStatus,
          metadata: { submittedAtLevel },
        },
      });

      return tx.validatorDeck.findUniqueOrThrow({ where: { id: deckId } });
    });
  }

  /**
   * Tier-gated approval. Non-admin: the caller's CURRENT validatorLevel
   * (read fresh from DB) must match the tier the deck is currently pending
   * at. Admin: always allowed from any PENDING_* state -- when the deck
   * is NOT at PENDING_ADMIN this is a bypass (writes ADMIN_BYPASS_APPROVED
   * and jumps straight to APPROVED); when it IS at PENDING_ADMIN this is
   * the normal admin-approve path for L3-created decks (writes APPROVED).
   *
   * Non-admin, tier-matched advancement:
   *  - PENDING_L2 (always an L1-created deck -- L2-created decks route
   *    straight to PENDING_L3 in submit()) + caller is L2 -> PENDING_L3.
   *  - PENDING_L3 + caller is L3 -> APPROVED (covers both an L1-created
   *    deck that already cleared L2, and an L2-created deck that routed
   *    straight here).
   */
  async approve(deckId: string, callerUserId: string, callerRole: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    const fromStatus = deck.status;
    if (
      fromStatus !== ValidatorDeckStatus.PENDING_L2 &&
      fromStatus !== ValidatorDeckStatus.PENDING_L3 &&
      fromStatus !== ValidatorDeckStatus.PENDING_ADMIN
    ) {
      throw new BadRequestException('This deck is not awaiting approval');
    }

    const isAdmin = callerRole === 'ADMIN';
    let callerLevel: ValidatorLevel | null = null;
    if (!isAdmin) {
      const caller = await this.prisma.user.findUnique({
        where: { id: callerUserId },
        select: { validatorLevel: true },
      });
      callerLevel = caller?.validatorLevel ?? null;
    }

    let toStatus: ValidatorDeckStatus;
    let action: ValidatorDeckAuditAction;

    if (isAdmin) {
      if (fromStatus === ValidatorDeckStatus.PENDING_ADMIN) {
        toStatus = ValidatorDeckStatus.APPROVED;
        action = ValidatorDeckAuditAction.APPROVED;
      } else {
        toStatus = ValidatorDeckStatus.APPROVED;
        action = ValidatorDeckAuditAction.ADMIN_BYPASS_APPROVED;
      }
    } else if (fromStatus === ValidatorDeckStatus.PENDING_L2) {
      if (callerLevel !== ValidatorLevel.L2) {
        throw new ForbiddenException('Only an L2 validator or an admin can approve this deck');
      }
      toStatus = ValidatorDeckStatus.PENDING_L3;
      action = ValidatorDeckAuditAction.APPROVED;
    } else if (fromStatus === ValidatorDeckStatus.PENDING_L3) {
      if (callerLevel !== ValidatorLevel.L3) {
        throw new ForbiddenException('Only an L3 validator or an admin can approve this deck');
      }
      toStatus = ValidatorDeckStatus.APPROVED;
      action = ValidatorDeckAuditAction.APPROVED;
    } else {
      // fromStatus === PENDING_ADMIN, non-admin caller
      throw new ForbiddenException('Only an admin can approve this deck');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.validatorDeck.updateMany({
        where: { id: deckId, status: fromStatus },
        data: { status: toStatus },
      });
      if (result.count !== 1) {
        throw new ConflictException('This deck was changed by someone else -- reload and try again');
      }
      await tx.validatorDeckAuditLog.create({
        data: { deckId, action, actorUserId: callerUserId, fromStatus, toStatus },
      });
      return tx.validatorDeck.findUniqueOrThrow({ where: { id: deckId } });
    });
  }

  /**
   * Any PENDING_* -> REJECTED. Same tier gating as approve (admin can
   * reject from any pending state too), but reject only ever writes the
   * single REJECTED action -- there is no "bypass-reject" audit action.
   */
  async reject(deckId: string, callerUserId: string, callerRole: string, reason: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    const fromStatus = deck.status;
    if (
      fromStatus !== ValidatorDeckStatus.PENDING_L2 &&
      fromStatus !== ValidatorDeckStatus.PENDING_L3 &&
      fromStatus !== ValidatorDeckStatus.PENDING_ADMIN
    ) {
      throw new BadRequestException('This deck is not awaiting approval');
    }

    const isAdmin = callerRole === 'ADMIN';
    if (!isAdmin) {
      const caller = await this.prisma.user.findUnique({
        where: { id: callerUserId },
        select: { validatorLevel: true },
      });
      const callerLevel = caller?.validatorLevel ?? null;
      const requiredLevel =
        fromStatus === ValidatorDeckStatus.PENDING_L2
          ? ValidatorLevel.L2
          : fromStatus === ValidatorDeckStatus.PENDING_L3
            ? ValidatorLevel.L3
            : null;
      if (requiredLevel === null || callerLevel !== requiredLevel) {
        throw new ForbiddenException('You are not authorized to reject this deck at its current stage');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.validatorDeck.updateMany({
        where: { id: deckId, status: fromStatus },
        data: { status: ValidatorDeckStatus.REJECTED },
      });
      if (result.count !== 1) {
        throw new ConflictException('This deck was changed by someone else -- reload and try again');
      }
      await tx.validatorDeckAuditLog.create({
        data: {
          deckId,
          action: ValidatorDeckAuditAction.REJECTED,
          actorUserId: callerUserId,
          fromStatus,
          toStatus: ValidatorDeckStatus.REJECTED,
          reason,
        },
      });
      return tx.validatorDeck.findUniqueOrThrow({ where: { id: deckId } });
    });
  }

  /** Decks currently awaiting the caller's own approval tier (or, for an admin, PENDING_ADMIN). */
  async listPendingMyApproval(callerUserId: string) {
    const caller = await this.prisma.user.findUnique({
      where: { id: callerUserId },
      select: { role: true, validatorLevel: true },
    });
    if (!caller) return [];

    let status: ValidatorDeckStatus | null = null;
    if (caller.role === 'ADMIN') {
      status = ValidatorDeckStatus.PENDING_ADMIN;
    } else if (caller.validatorLevel === ValidatorLevel.L2) {
      status = ValidatorDeckStatus.PENDING_L2;
    } else if (caller.validatorLevel === ValidatorLevel.L3) {
      status = ValidatorDeckStatus.PENDING_L3;
    }
    if (!status) return [];

    return this.prisma.validatorDeck.findMany({
      where: { status },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Admin: every deck, any status, with optional status/owner filters. */
  async adminListAll(filter: { status?: ValidatorDeckStatus; ownerUserId?: string }) {
    return this.prisma.validatorDeck.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
      },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Full audit trail for a deck, newest-first. */
  async getAuditLog(deckId: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId }, select: { id: true } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    return this.prisma.validatorDeckAuditLog.findMany({
      where: { deckId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private nextPendingStatusForLevel(level: ValidatorLevel): ValidatorDeckStatus {
    switch (level) {
      case ValidatorLevel.L1:
        return ValidatorDeckStatus.PENDING_L2;
      case ValidatorLevel.L2:
        return ValidatorDeckStatus.PENDING_L3;
      case ValidatorLevel.L3:
        return ValidatorDeckStatus.PENDING_ADMIN;
      default:
        return ValidatorDeckStatus.PENDING_L2;
    }
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
