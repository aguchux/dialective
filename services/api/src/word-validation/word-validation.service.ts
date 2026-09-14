import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { WordValidationFlag } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { CoursesService } from '../courses/courses.service';
import { AUDIT_HOLD_MESSAGE, isOnAuditHold } from '../common/audit-hold.util';
import { SubmitWordValidationDto } from './dto/submit-word-validation.dto';
import { ResolveMisplacedDialectDto } from './dto/resolve-misplaced-dialect.dto';

const DISTRACTOR_COUNT = 3; // total options shown = 1 correct + this many distractors

/**
 * "Dialect Validation" task -- a trainer listens to a PEER's
 * ENGLISH_TO_DIALECT WordRecording (own dialect, never their own audio) and
 * either picks the English word they heard from a multiple-choice list
 * and/or ticks problem flags (WordValidationFlag). Deliberately a sibling
 * module to WordsService/DomainConversationsService, not a branch of
 * either -- no upload lifecycle (no new audio is produced by this task), no
 * token cost/lock (unlike the other two tasks), optional flat payout on
 * submit instead. Session lifecycle (start/end/QRAC) stays on
 * WordsController/WordsService, same as DomainConversationsService.
 */
@Injectable()
export class WordValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
    private readonly courses: CoursesService,
  ) {}

  async nextItem(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (session.endedAt) throw new ConflictException('This training session has ended');

    await this.assertNotOnAuditHold(userId);

    const incompleteRequired = await this.courses.getIncompleteRequiredCourses(userId);
    if (incompleteRequired.length > 0) {
      throw new ForbiddenException({
        message: 'Complete the required course(s) below before you can continue training.',
        requiredCourses: incompleteRequired,
      });
    }

    if (await this.settings.isQracEnabled()) {
      const requireAtSessionStart = await this.settings.isQracRequiredAtSessionStart();
      const intervalMinutes = await this.settings.getQracIntervalMinutes();
      const anchor = session.lastQracAt ?? session.startedAt;
      const dueAt = new Date(anchor.getTime() + intervalMinutes * 60_000);
      if (
        (requireAtSessionStart && !session.lastQracAt) ||
        (!requireAtSessionStart && new Date() >= dueAt)
      ) {
        throw new ForbiddenException({
          message: 'Confirm the quality recording checklist to continue.',
          qracRequired: true,
        });
      }
    }

    if (!(await this.settings.isDialectValidationTaskEnabled())) {
      throw new NotFoundException('NO_VALIDATION_ITEMS_AVAILABLE');
    }

    const trainer = await this.getTrainer(userId);

    const recording = await this.pickCandidate(userId, trainer.dialect!.tag);
    if (!recording) {
      throw new NotFoundException('NO_VALIDATION_ITEMS_AVAILABLE');
    }

    const wordOptions = await this.buildWordOptions(recording.wordId);
    const audioUrl =
      recording.audioBucket && recording.audioKey
        ? (await this.storage.createPresignedDownloadUrl(recording.audioBucket, recording.audioKey)).url
        : null;

    return {
      recordingId: recording.id,
      audioUrl,
      wordOptions,
      dialectTag: trainer.dialect!.tag,
      dialectName: trainer.dialect!.name,
    };
  }

  async submit(userId: string, body: SubmitWordValidationDto) {
    const recording = await this.prisma.wordRecording.findUnique({
      where: { id: body.recordingId },
      select: { id: true, wordId: true, misplacedDialectAt: true },
    });
    if (!recording) throw new NotFoundException('Recording not found');
    if (recording.misplacedDialectAt) {
      throw new ConflictException('This recording has already been moved to the misplaced-dialect queue');
    }
    if (!body.selectedWordId && !(body.flags && body.flags.length > 0)) {
      throw new BadRequestException('Pick a word or tick at least one flag before submitting');
    }

    const threshold = await this.settings.getMisplacedDialectFlagThreshold();
    const [payoutEnabled, payoutTokens] = await Promise.all([
      this.settings.isDialectValidationTaskEnabled(),
      this.settings.getDialectValidationPayoutTokens(),
    ]);
    const flaggedWrongDialect = !!body.flags?.includes(WordValidationFlag.WRONG_DIALECT);

    const result = await this.prisma.$transaction(async (tx) => {
      let validation;
      try {
        validation = await tx.wordValidation.create({
          data: {
            recordingId: recording.id,
            validatorId: userId,
            selectedWordId: body.selectedWordId ?? null,
            isCorrectMatch: body.selectedWordId ? body.selectedWordId === recording.wordId : null,
            transcript: body.transcript ?? null,
            flags: body.flags ?? [],
          },
        });
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'P2002') {
          throw new ConflictException('You have already validated this recording');
        }
        throw err;
      }

      let misplaced = false;
      if (flaggedWrongDialect) {
        const updated = await tx.wordRecording.update({
          where: { id: recording.id },
          data: { wrongDialectFlagCount: { increment: 1 } },
          select: { wrongDialectFlagCount: true, misplacedDialectAt: true },
        });
        if (!updated.misplacedDialectAt && updated.wrongDialectFlagCount >= threshold) {
          await tx.wordRecording.update({
            where: { id: recording.id },
            data: { misplacedDialectAt: new Date() },
          });
          misplaced = true;
        }
      }

      let rewarded = false;
      let rewardAmount: string | null = null;
      if (payoutEnabled && payoutTokens > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          update: {},
          create: { userId },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: payoutTokens } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: 'VALIDATION_REWARD',
            amount: payoutTokens,
            reference: `word-validation:${validation.id}`,
          },
        });
        rewarded = true;
        rewardAmount = String(payoutTokens);
      }

      return { validationId: validation.id, rewarded, rewardAmount, misplaced };
    });

    return result;
  }

  // --- Admin: misplaced-dialect queue --------------------------------------

  async listMisplacedDialectRecordings(page: number, pageSize: number) {
    const where = { misplacedDialectAt: { not: null } };
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where,
        include: { word: { select: { text: true } } },
        orderBy: [{ misplacedDialectAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.wordRecording.count({ where }),
    ]);
    const withAudioUrls = await Promise.all(
      items.map(async (recording) => ({
        ...recording,
        audioUrl:
          recording.audioBucket && recording.audioKey
            ? (await this.storage.createPresignedDownloadUrl(recording.audioBucket, recording.audioKey)).url
            : null,
      })),
    );
    return {
      items: withAudioUrls,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async resolveMisplacedDialectRecording(recordingId: string, dto: ResolveMisplacedDialectDto) {
    const recording = await this.prisma.wordRecording.findUnique({ where: { id: recordingId } });
    if (!recording) throw new NotFoundException('Recording not found');
    if (!recording.misplacedDialectAt) {
      throw new ConflictException('This recording is not in the misplaced-dialect queue');
    }

    if (dto.action === 'DELETE') {
      await this.prisma.wordRecording.delete({ where: { id: recordingId } });
      return { status: 'deleted' };
    }

    const dialect = await this.prisma.dialect.findFirst({ where: { tag: dto.dialectTag } });
    if (!dialect) throw new NotFoundException('Target dialect not found');
    if (dto.dialectVariantId) {
      const variant = await this.prisma.dialectVariant.findUnique({ where: { id: dto.dialectVariantId } });
      if (!variant || variant.dialectId !== dialect.id) {
        throw new NotFoundException('Target dialect variant not found for that dialect');
      }
    }

    await this.prisma.wordRecording.update({
      where: { id: recordingId },
      data: {
        dialectTag: dialect.tag,
        dialectVariantId: dto.dialectVariantId ?? null,
        misplacedDialectAt: null,
        wrongDialectFlagCount: 0,
      },
    });
    return { status: 'reassigned', dialectTag: dialect.tag };
  }

  // --- Internal helpers ------------------------------------------------------

  /** Mirrors WordsService.pickReverseSource's peer/own-dialect query, minus
   * per-session exclusion (this task has no assignment/upload lifecycle) --
   * excludes the trainer's own recordings and anything they've already
   * validated or that's already in the misplaced-dialect queue. */
  private async pickCandidate(userId: string, dialectTag: string) {
    const where = {
      dialectTag,
      direction: 'ENGLISH_TO_DIALECT' as const,
      userId: { not: userId },
      noiseRating: { not: 'NOISY' as const },
      misplacedDialectAt: null,
      wordId: { not: null },
      validations: { none: { validatorId: userId } },
    };
    const count = await this.prisma.wordRecording.count({ where });
    if (count === 0) return null;
    const [recording] = await this.prisma.wordRecording.findMany({
      where,
      take: 1,
      skip: Math.floor(Math.random() * count),
    });
    return recording ?? null;
  }

  private async buildWordOptions(
    correctWordId: string | null,
  ): Promise<{ id: string; text: string }[]> {
    if (!correctWordId) return [];
    const correctWord = await this.prisma.word.findUnique({ where: { id: correctWordId } });
    if (!correctWord) return [];

    const distractorPoolCount = await this.prisma.word.count({
      where: { id: { not: correctWordId }, isDisabled: false },
    });
    const takeCount = Math.min(DISTRACTOR_COUNT, distractorPoolCount);
    const distractors: { id: string; text: string }[] = [];
    if (takeCount > 0) {
      const skip = Math.max(0, Math.floor(Math.random() * (distractorPoolCount - takeCount + 1)));
      const rows = await this.prisma.word.findMany({
        where: { id: { not: correctWordId }, isDisabled: false },
        select: { id: true, text: true },
        orderBy: { id: 'asc' },
        skip,
        take: takeCount,
      });
      distractors.push(...rows);
    }

    const options = [{ id: correctWord.id, text: correctWord.text }, ...distractors];
    // Fisher-Yates shuffle so the correct answer isn't always first.
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  }

  private async assertNotOnAuditHold(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { auditHoldAt: true, auditHoldReleasedAt: true },
    });
    if (!user) throw new NotFoundException('Trainer not found');
    if (isOnAuditHold(user)) {
      throw new ForbiddenException(AUDIT_HOLD_MESSAGE);
    }
  }

  private async getTrainer(userId: string) {
    const trainer = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { dialect: true, dialectVariant: true },
    });
    if (!trainer) throw new NotFoundException('Trainer not found');
    if (
      !trainer.dialect ||
      trainer.dialect.active === false ||
      !trainer.dialectVariantId ||
      trainer.dialectVariant?.active === false
    ) {
      throw new UnprocessableEntityException('Complete dialect onboarding before training');
    }
    if (trainer.dialect.tasksPaused || trainer.dialectVariant?.tasksPaused) {
      throw new UnprocessableEntityException(
        'Training tasks are temporarily paused for your dialect. Check back soon.',
      );
    }
    return trainer;
  }

  private async getOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Training session not found');
    if (session.userId !== userId) {
      throw new ForbiddenException('Training session does not belong to you');
    }
    return session;
  }
}
