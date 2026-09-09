import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  buildValidatorPayoutOps,
  computeValidatorPayoutBreakdown,
  StreamDeckType,
  ValidatorDeckAuditAction,
  ValidatorDeckStatus,
  ValidatorItemStatus,
  ValidatorLevel,
} from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CreateValidatorDeckDto } from './dto/create-validator-deck.dto';
import { UpdateValidatorDeckDto } from './dto/update-validator-deck.dto';
import { ScoreValidatorDeckItemDto } from './dto/score-validator-deck-item.dto';
import { UpdateValidatorTranscriptDto } from './dto/update-validator-transcript.dto';
import { FlagValidatorDeckItemDto } from './dto/flag-validator-deck-item.dto';

// Reserved singleton SubscriberOrganization id seeded by the
// 20260908160000_add_validator_payouts_and_publish migration -- see
// docs/validators.md "Confirmed product decisions" #5. Every published
// ValidatorDeck bridges into a StreamDeck owned by this org.
export const DIALECT_LIBRARY_PLATFORM_ORG_ID = 'dialect-library-platform';

/**
 * "DLSD-{country}-{dialect}-{subdialect}-{6 chars}" -- identical format to
 * StreamDecksService.generateDeckKey (voice-stream/stream-decks), duplicated
 * here rather than imported since that service lives in a sibling module not
 * exported for cross-module reuse and pulling in its whole module (Stripe
 * billing dependencies, catalogue service, etc.) just for this one pure
 * string helper isn't worth the coupling.
 */
function generateDeckKey(countryCode?: string | null, dialectTag?: string | null): string {
  const country = (countryCode ?? 'GEN').toUpperCase();
  const dialect = (dialectTag ?? 'GEN').toUpperCase();
  const suffix = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `DLSD-${country}-${dialect}-GEN-${suffix}`;
}

/**
 * Phase 1 (docs/validators.md): DRAFT-only deck lifecycle -- any validator
 * can view any deck (mirrors "other validators can view all private decks"
 * from the plan), but only the deck's owner (or an admin) may edit it.
 * There is deliberately no visibility flag like StreamDeck's PRIVATE/PUBLIC:
 * *edit* rights are scoped, not *read* rights.
 *
 * Phase 2 adds the full approval-chain state machine (submit/approve/reject)
 * plus the append-only ValidatorDeckAuditLog. Decks can reach APPROVED here.
 *
 * Phase 3 adds publish() (the StreamDeck bridge + VALIDATION_REWARD payout,
 * admin-only), reassign() (admin-only same-tier reassignment with a
 * frozen-at-reassignment penalty split), and adminCloneFromStreamDeck() (the
 * "clone a B2B deck back down for revalidation" flow) -- see
 * packages/db/src/validator-payouts.ts for the payout math itself.
 */
@Injectable()
export class ValidatorDecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async create(ownerUserId: string, callerRole: string, dto: CreateValidatorDeckDto) {
    const dialect = await this.prisma.dialect.findUnique({
      where: { id: dto.dialectId },
      include: { country: true },
    });
    if (!dialect || dialect.countryId !== dto.countryId || !dialect.active) {
      throw new UnprocessableEntityException('Select an active dialect for the given country');
    }

    if (dto.dialectVariantId) {
      const variant = await this.prisma.dialectVariant.findUnique({
        where: { id: dto.dialectVariantId },
      });
      if (!variant || variant.dialectId !== dto.dialectId || !variant.active) {
        throw new UnprocessableEntityException('Select an active sub-dialect for the given dialect');
      }
    }

    // Admins may create a deck for any dialect; a validator may only create
    // one for a dialect they've been onboarded to (see
    // ValidatorDialectAssignment, admin-managed, docs/validators.md).
    if (callerRole !== 'ADMIN') {
      const assignment = await this.prisma.validatorDialectAssignment.findUnique({
        where: { userId_dialectId: { userId: ownerUserId, dialectId: dto.dialectId } },
      });
      if (!assignment) {
        throw new ForbiddenException('You are not onboarded to this dialect');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const deck = await tx.validatorDeck.create({
        data: {
          name: dto.name,
          dialectTag: dialect.tag,
          countryCode: dialect.country.code,
          dialectId: dto.dialectId,
          dialectVariantId: dto.dialectVariantId,
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

  /** Trainer-facing: the caller's own onboarded dialects, for populating the create-deck dropdown. */
  async listMyDialectAssignments(callerUserId: string) {
    const assignments = await this.prisma.validatorDialectAssignment.findMany({
      where: { userId: callerUserId },
      include: { dialect: { include: { country: true } } },
      orderBy: { assignedAt: 'asc' },
    });
    return assignments.map((a) => ({
      dialectId: a.dialectId,
      dialectName: a.dialect.name,
      dialectTag: a.dialect.tag,
      countryId: a.dialect.countryId,
      countryName: a.dialect.country.name,
      countryCode: a.dialect.country.code,
    }));
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

    // Deck-level dialect scoping (nullable only for decks predating this
    // constraint): once a deck has a dialect/subdialect, only matching
    // recordings may join it, keeping the deck coherent for publish.
    if (deck.dialectId) {
      const deckDialect = await this.prisma.dialect.findUnique({ where: { id: deck.dialectId } });
      if (!deckDialect || recording.dialectTag !== deckDialect.tag) {
        throw new UnprocessableEntityException('This recording is not in the deck\'s dialect');
      }
      if (deck.dialectVariantId && recording.dialectVariantId !== deck.dialectVariantId) {
        throw new UnprocessableEntityException('This recording is not in the deck\'s sub-dialect');
      }
    }

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
   * Saves the validator's own transcript for this item -- distinct from
   * WordRecording.transcript (ASR-generated) and .translationText (the
   * trainer's original submission), neither of which this ever touches.
   * Same DRAFT-only/owner-or-admin edit gate as scoreItem; callable
   * independently of scoring so a validator can save transcript progress
   * before deciding a score.
   */
  async updateTranscript(
    deckId: string,
    callerUserId: string,
    callerRole: string,
    recordingId: string,
    dto: UpdateValidatorTranscriptDto,
  ) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);
    const item = await this.prisma.validatorDeckItem.findUnique({
      where: { deckId_recordingId: { deckId: deck.id, recordingId } },
    });
    if (!item) throw new NotFoundException('This recording is not in the deck');

    return this.prisma.validatorDeckItem.update({
      where: { id: item.id },
      data: {
        validatorTranscript: dto.transcript,
        validatorTranscriptUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Flags an item with a reason (Validation Workspace UI spec's flag-reason
   * list). Independent of validationStatus -- a validator typically flags
   * and also marks the item REJECTED/INVALID via scoreItem, but each call
   * is separate so the UI can save a flag without forcing a score decision
   * in the same request. Same DRAFT-only/owner-or-admin edit gate as
   * scoreItem/updateTranscript. Re-flagging overwrites the previous
   * reason/note -- only the latest flag is kept, per flaggedAt semantics.
   */
  async flagItem(
    deckId: string,
    callerUserId: string,
    callerRole: string,
    recordingId: string,
    dto: FlagValidatorDeckItemDto,
  ) {
    const deck = await this.assertEditable(deckId, callerUserId, callerRole);
    const item = await this.prisma.validatorDeckItem.findUnique({
      where: { deckId_recordingId: { deckId: deck.id, recordingId } },
    });
    if (!item) throw new NotFoundException('This recording is not in the deck');

    return this.prisma.validatorDeckItem.update({
      where: { id: item.id },
      data: {
        flagReason: dto.reason,
        flagNote: dto.note ?? null,
        flaggedByUserId: callerUserId,
        flaggedAt: new Date(),
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

  /**
   * Phase 3, admin-only. A deck must NOT already be PUBLISHED/ARCHIVED --
   * any other status (including DRAFT, PENDING_L2/L3/ADMIN, REJECTED, not just APPROVED)
   * can be reassigned, since reassignment is meant to happen when an admin
   * decides mid-review that the current owner's work should go to a peer,
   * not only after a deck has cleared the whole chain. Captures the
   * PREVIOUS ownerUserId as reassignedFromUserId and freezes the penalty
   * percent used (explicit penaltyPercent, or the global
   * validatorReassignmentPenaltyPercent default) onto the deck row so a
   * later change to the global setting never retroactively alters this
   * reassignment's eventual publish-time payout split.
   */
  async reassign(deckId: string, adminUserId: string, newOwnerUserId: string, penaltyPercent?: number) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    if (deck.status === ValidatorDeckStatus.PUBLISHED || deck.status === ValidatorDeckStatus.ARCHIVED) {
      throw new BadRequestException('A published or archived deck cannot be reassigned');
    }
    if (newOwnerUserId === deck.ownerUserId) {
      throw new BadRequestException('This deck is already owned by that validator');
    }

    const newOwner = await this.prisma.user.findUnique({ where: { id: newOwnerUserId } });
    if (!newOwner || newOwner.role !== 'VALIDATOR') {
      throw new BadRequestException('newOwnerUserId must be an existing validator');
    }

    const effectivePenaltyPercent =
      penaltyPercent ?? (await this.settings.getValidatorReassignmentPenaltyPercent());
    const previousOwnerUserId = deck.ownerUserId;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.validatorDeck.update({
        where: { id: deckId },
        data: {
          ownerUserId: newOwnerUserId,
          reassignedFromUserId: previousOwnerUserId,
          reassignedAt: new Date(),
          effectiveReassignmentPenaltyPercent: effectivePenaltyPercent,
        },
      });
      await tx.validatorDeckAuditLog.create({
        data: {
          deckId,
          action: ValidatorDeckAuditAction.REASSIGNED,
          actorUserId: adminUserId,
          metadata: {
            fromUserId: previousOwnerUserId,
            toUserId: newOwnerUserId,
            penaltyPercent: effectivePenaltyPercent,
          },
        },
      });
      return updated;
    });
  }

  /**
   * Phase 3, admin-only. Bridges an APPROVED deck into a new PUBLIC
   * StreamDeck owned by the reserved "Dialect Library" platform org, mints
   * the VALIDATION_REWARD payout (skipped entirely when the configured rate
   * is 0 -- the deck still publishes), and marks the deck PUBLISHED. All in
   * one $transaction so the StreamDeck/items, the payout crediting, the
   * ValidatorDeck status flip, and the audit log entry commit atomically.
   *
   * Optimistic-concurrency guarded the same way submit/approve/reject are:
   * updateMany({status: 'APPROVED'}) + count===1 + ConflictException, so a
   * double-click or a race against another admin can never publish twice.
   */
  async publish(deckId: string, adminUserId: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    if (deck.status !== ValidatorDeckStatus.APPROVED) {
      throw new BadRequestException('Only an approved deck can be published');
    }

    const [validItems, auditLogs, rate, l1Percent, l2Percent, l3Percent] = await Promise.all([
      this.prisma.validatorDeckItem.findMany({
        where: { deckId, validationStatus: ValidatorItemStatus.VALID },
        select: { recordingId: true },
      }),
      this.prisma.validatorDeckAuditLog.findMany({
        where: { deckId },
        select: { action: true, actorUserId: true, fromStatus: true },
      }),
      this.settings.getValidationRewardPerRecording(),
      this.settings.getValidatorL1ApprovalBonusPercent(),
      this.settings.getValidatorL2ApprovalBonusPercent(),
      this.settings.getValidatorL3ApprovalBonusPercent(),
    ]);

    const breakdown = computeValidatorPayoutBreakdown(
      {
        id: deck.id,
        createdByUserId: deck.createdByUserId,
        ownerUserId: deck.ownerUserId,
        reassignedFromUserId: deck.reassignedFromUserId,
        effectiveReassignmentPenaltyPercent: deck.effectiveReassignmentPenaltyPercent,
      },
      validItems.length,
      auditLogs,
      {
        validationRewardPerRecording: rate,
        validatorL1ApprovalBonusPercent: l1Percent,
        validatorL2ApprovalBonusPercent: l2Percent,
        validatorL3ApprovalBonusPercent: l3Percent,
      },
    );

    return this.prisma.$transaction(async (tx) => {
      const payoutOps = await buildValidatorPayoutOps(tx, breakdown);

      const streamDeck = await tx.streamDeck.create({
        data: {
          deckKey: generateDeckKey(deck.countryCode, deck.dialectTag),
          organizationId: DIALECT_LIBRARY_PLATFORM_ORG_ID,
          name: deck.name,
          type: StreamDeckType.MANUAL,
          createdByUserId: adminUserId,
          visibility: 'PUBLIC',
        },
      });

      if (validItems.length > 0) {
        await tx.streamDeckItem.createMany({
          data: validItems.map((item) => ({
            deckId: streamDeck.id,
            recordingId: item.recordingId,
            addedByUserId: adminUserId,
          })),
        });
      }

      for (const op of payoutOps) {
        await op;
      }

      const result = await tx.validatorDeck.updateMany({
        where: { id: deckId, status: ValidatorDeckStatus.APPROVED },
        data: {
          status: ValidatorDeckStatus.PUBLISHED,
          publishedStreamDeckId: streamDeck.id,
          publishedAt: new Date(),
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('This deck was changed by someone else -- reload and try again');
      }

      await tx.validatorDeckAuditLog.create({
        data: {
          deckId,
          action: ValidatorDeckAuditAction.PUBLISHED,
          actorUserId: adminUserId,
          fromStatus: ValidatorDeckStatus.APPROVED,
          toStatus: ValidatorDeckStatus.PUBLISHED,
          metadata: {
            streamDeckId: streamDeck.id,
            validCount: validItems.length,
            rate: breakdown.rate.toString(),
            base: breakdown.base.toString(),
            totalPayout: breakdown.totalPayout.toString(),
            lines: breakdown.lines.map((line) => ({
              userId: line.userId,
              role: line.role,
              amount: line.amount.toString(),
            })),
          },
        },
      });

      return tx.validatorDeck.findUniqueOrThrow({ where: { id: deckId } });
    });
  }

  /**
   * Phase 3, admin-only. Terminal, one-way archive for a deck that should no
   * longer be actively worked -- PUBLISHED decks stay PUBLISHED forever (the
   * StreamDeck bridge is the durable record at that point; archiving would
   * be meaningless/misleading), so archive() only accepts a deck that is
   * NOT already PUBLISHED or ARCHIVED. No optimistic-concurrency guard
   * needed beyond that plain status check -- this is an admin-only terminal
   * transition with no peer/tier contention to race against.
   */
  async archive(deckId: string, adminUserId: string) {
    const deck = await this.prisma.validatorDeck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Validator deck not found');
    if (deck.status === ValidatorDeckStatus.PUBLISHED || deck.status === ValidatorDeckStatus.ARCHIVED) {
      throw new BadRequestException('A published or already-archived deck cannot be archived');
    }
    const fromStatus = deck.status;

    return this.prisma.$transaction(async (tx) => {
      await tx.validatorDeck.update({
        where: { id: deckId },
        data: { status: ValidatorDeckStatus.ARCHIVED },
      });
      await tx.validatorDeckAuditLog.create({
        data: {
          deckId,
          action: ValidatorDeckAuditAction.ARCHIVED,
          actorUserId: adminUserId,
          fromStatus,
          toStatus: ValidatorDeckStatus.ARCHIVED,
        },
      });
      return tx.validatorDeck.findUniqueOrThrow({ where: { id: deckId } });
    });
  }

  /**
   * Phase 3, admin-only. "Clone a B2B deck back down for revalidation" (plan
   * item #4): copies a StreamDeck's items into a brand-new DRAFT
   * ValidatorDeck owned by targetOwnerUserId. Every copied item starts
   * UNSCORED so DL's own validators re-review it from scratch -- a prior
   * StreamDeckItem's presence there says nothing about DL-internal
   * validation quality. ValidatorDeck has no clonedFromDeckId field (Phase
   * 1/2 never added one for this cross-model StreamDeck->ValidatorDeck
   * direction, only within ValidatorDeck-to-ValidatorDeck clone() -- out of
   * scope to add here per the plan's "use judgment" allowance), so
   * provenance is recorded in the CLONED audit log's metadata instead.
   */
  async adminCloneFromStreamDeck(streamDeckId: string, targetOwnerUserId: string, adminUserId: string) {
    const streamDeck = await this.prisma.streamDeck.findUnique({
      where: { id: streamDeckId },
      include: { items: true },
    });
    if (!streamDeck) throw new NotFoundException('Stream Deck not found');

    const targetOwner = await this.prisma.user.findUnique({ where: { id: targetOwnerUserId } });
    if (!targetOwner || targetOwner.role !== 'VALIDATOR') {
      throw new BadRequestException('targetOwnerUserId must be an existing validator');
    }

    return this.prisma.$transaction(async (tx) => {
      const deck = await tx.validatorDeck.create({
        data: {
          name: `${streamDeck.name} (cloned)`,
          createdByUserId: targetOwnerUserId,
          ownerUserId: targetOwnerUserId,
        },
      });

      if (streamDeck.items.length > 0) {
        await tx.validatorDeckItem.createMany({
          data: streamDeck.items.map((item) => ({
            deckId: deck.id,
            recordingId: item.recordingId,
            addedByUserId: adminUserId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.validatorDeckAuditLog.create({
        data: {
          deckId: deck.id,
          action: ValidatorDeckAuditAction.CLONED,
          actorUserId: adminUserId,
          toStatus: ValidatorDeckStatus.DRAFT,
          metadata: {
            sourceStreamDeckId: streamDeckId,
            sourceStreamDeckKey: streamDeck.deckKey,
            itemCount: streamDeck.items.length,
          },
        },
      });

      return deck;
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
