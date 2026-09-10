import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DomainPromptGenderVariant, Gender } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { RedisStreamsService } from '../redis-streams/redis-streams.service';
import { CoursesService } from '../courses/courses.service';
import { AUDIT_HOLD_MESSAGE, isOnAuditHold } from '../common/audit-hold.util';
import { CreateDomainConversationUploadUrlDto } from './dto/create-domain-conversation-upload-url.dto';
import { CreateDomainConversationRecordingDto } from './dto/create-domain-conversation-recording.dto';
import { ListDomainConversationSubmissionsDto } from './dto/list-domain-conversation-submissions.dto';
import { ListDomainPromptsAdminDto } from './dto/list-domain-prompts-admin.dto';
import { CreateDomainPromptAdminDto } from './dto/create-domain-prompt-admin.dto';
import { UpdateDomainPromptAdminDto } from './dto/update-domain-prompt-admin.dto';

const RECORDINGS_BUCKET = process.env.SPACES_WORD_RECORDINGS_BUCKET ?? 'dialectiva-word-recordings';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

function kebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * "Domain Conversation" task type -- a trainer records ONE continuous clip
 * (gated by an admin-configurable min/max duration) responding to a
 * pregenerated scenario prompt (e.g. "As a market woman, buying rice").
 * Deliberately a sibling module to WordsService/WordsController, not a
 * fourth branch inside WordsService.nextAssignment -- shares no underlying
 * tables with word training (see DomainPrompt/DomainConversationRecording/
 * DomainConversationAssignment in schema.prisma), and the recording UX
 * (continuous elapsed-time-up clip, no typed transcript, no reverse-
 * validation) is materially different. Session lifecycle (start/end/QRAC)
 * stays on WordsController/WordsService -- both task types share one
 * TrainingSession per dashboard visit; this service's methods take an
 * existing sessionId the same way WordsService.nextAssignment does.
 */
@Injectable()
export class DomainConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
    private readonly streams: RedisStreamsService,
    private readonly courses: CoursesService,
  ) {}

  async nextPrompt(userId: string, sessionId: string) {
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

    if (!(await this.settings.isDomainConversationTaskEnabled())) {
      throw new NotFoundException('NO_DOMAIN_PROMPTS_AVAILABLE');
    }

    const trainer = await this.getTrainer(userId);
    const [taskTokenCost, wallet] = await Promise.all([
      this.settings.getDomainConversationTaskTokenCost(),
      this.prisma.wallet.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
    ]);
    if (wallet.balance.lt(taskTokenCost)) {
      throw new UnprocessableEntityException({
        message: `Insufficient balance: this task costs ${taskTokenCost} tokens`,
        insufficientBalance: true,
        taskTokenCost,
      });
    }

    const prompt = await this.pickDomainPrompt(trainer.gender);
    if (!prompt) {
      throw new NotFoundException('NO_DOMAIN_PROMPTS_AVAILABLE');
    }

    const assignment = await this.prisma.domainConversationAssignment.create({
      data: { sessionId, promptId: prompt.id },
    });

    const [minDurationSeconds, maxDurationSeconds] = await Promise.all([
      this.settings.getDomainConversationMinDurationSeconds(),
      this.settings.getDomainConversationMaxDurationSeconds(),
    ]);

    return {
      assignmentId: assignment.id,
      promptId: prompt.id,
      domain: prompt.domain,
      promptText: prompt.text,
      dialectTag: trainer.dialect!.tag,
      minDurationSeconds,
      maxDurationSeconds,
    };
  }

  async createUploadUrl(userId: string, body: CreateDomainConversationUploadUrlDto) {
    const assignment = await this.getOwnedAssignment(userId, body.assignmentId);
    if (assignment.consumedAt) {
      throw new ConflictException('This recording has already been submitted');
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[body.contentType];
    const trainer = assignment.session.user;
    // Variant tag is only unique per-dialect (see DialectVariant's doc
    // comment), so it's always nested under the parent dialect segment --
    // same convention as WordsService.createUploadUrl.
    const dialectPath = trainer.dialectVariant
      ? `${trainer.dialect!.tag}/${trainer.dialectVariant.tag}`
      : trainer.dialect!.tag;
    const domainSlug = kebabCase(assignment.prompt.domain);
    const key = `${dialectPath}/domain-conversation/${domainSlug}/${assignment.id}/${randomUUID()}.${extension}`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      RECORDINGS_BUCKET,
      key,
      body.contentType,
    );

    await this.prisma.domainConversationAssignment.update({
      where: { id: assignment.id },
      data: { uploadBucket: RECORDINGS_BUCKET, uploadKey: key },
    });
    return { uploadUrl: url, key, bucket: RECORDINGS_BUCKET, expiresInSeconds };
  }

  async createRecording(userId: string, body: CreateDomainConversationRecordingDto) {
    const assignment = await this.getOwnedAssignment(userId, body.assignmentId);
    if (assignment.consumedAt) {
      throw new ConflictException('This recording has already been submitted');
    }
    if (!assignment.uploadBucket || !assignment.uploadKey) {
      throw new UnprocessableEntityException('Upload the recording before submitting it');
    }
    if (assignment.uploadBucket !== body.bucket || assignment.uploadKey !== body.audioKey) {
      throw new ForbiddenException('Recording upload does not belong to this assignment');
    }

    const [minSeconds, maxSeconds] = await Promise.all([
      this.settings.getDomainConversationMinDurationSeconds(),
      this.settings.getDomainConversationMaxDurationSeconds(),
    ]);
    const minMs = minSeconds * 1000;
    const maxMs = maxSeconds * 1000;
    const durationGraceMs = 5_000;
    if (body.durationMs < minMs) {
      throw new UnprocessableEntityException(
        `Recording must be at least ${minSeconds}s for this task`,
      );
    }
    if (body.durationMs > maxMs + durationGraceMs) {
      throw new UnprocessableEntityException(`Recording exceeds the ${maxSeconds}s limit for this task`);
    }

    const taskTokenCost = await this.settings.getDomainConversationTaskTokenCost();
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const trainer = assignment.session.user;
    const recording = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.domainConversationAssignment.updateMany({
        where: { id: assignment.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw new ConflictException('This recording has already been submitted');
      }

      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: taskTokenCost } },
        data: {
          balance: { decrement: taskTokenCost },
          lockedBalance: { increment: taskTokenCost },
        },
      });
      if (lock.count === 0) {
        throw new UnprocessableEntityException(
          `Insufficient balance: this task costs ${taskTokenCost} tokens`,
        );
      }

      const created = await tx.domainConversationRecording.create({
        data: {
          promptId: assignment.promptId,
          userId,
          sessionId: assignment.sessionId,
          assignmentId: assignment.id,
          dialectTag: trainer.dialect!.tag,
          dialectVariantId: trainer.dialectVariantId,
          audioBucket: body.bucket,
          audioKey: body.audioKey,
          durationMs: body.durationMs,
          noiseRating: body.noiseRating,
          tokensSpent: taskTokenCost,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'TASK_LOCK',
          amount: -taskTokenCost,
          reference: created.id,
        },
      });

      return created;
    });

    // No expected_text/asr_stream -- this record kind skips ASR/exact-match
    // scoring entirely (there is no fixed expected text for a free-form
    // conversation). quality-gate-worker still runs noise/quality/liveness
    // scoring for it via the record_kind discriminator.
    await this.streams.publish('quality-gate-jobs', {
      record_kind: 'domain_conversation_recording',
      word_recording_id: recording.id,
      bucket: body.bucket,
      audio_key: body.audioKey,
      dialect_tag: trainer.dialect!.tag,
      max_duration_s: String(maxSeconds),
    });

    await this.checkAuditHoldThreshold(userId);

    return {
      recordingId: recording.id,
      status: 'saved',
    };
  }

  async listMine(userId: string, query: ListDomainConversationSubmissionsDto) {
    const where = { userId, ...(query.status ? { status: { in: query.status } } : {}) };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.domainConversationRecording.findMany({
        where,
        include: { prompt: { select: { domain: true, text: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.domainConversationRecording.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * Least-recently-used pick across the gender-appropriate pool, falling
   * back to NEUTRAL when the trainer has no gender set or that variant's
   * pool is empty for every scenario. Deliberately NOT per-trainer
   * exclusion (unlike WordsService's word/sentence pickers) -- the same
   * prompt serving many different trainers is the explicit requirement,
   * not a bug to guard against. Stamping lastServedAt on pick IS the
   * round-robin mechanism: the just-served row sorts to the back of the
   * queue for its next pick.
   */
  private async pickDomainPrompt(gender: Gender | null) {
    const desiredVariant: DomainPromptGenderVariant =
      gender === Gender.MALE
        ? DomainPromptGenderVariant.MALE
        : gender === Gender.FEMALE
          ? DomainPromptGenderVariant.FEMALE
          : DomainPromptGenderVariant.NEUTRAL;

    const picked = await this.pickFromVariant(desiredVariant);
    if (picked) return picked;

    if (desiredVariant !== DomainPromptGenderVariant.NEUTRAL) {
      const fallback = await this.pickFromVariant(DomainPromptGenderVariant.NEUTRAL);
      if (fallback) return fallback;
    }

    return null;
  }

  private async pickFromVariant(genderVariant: DomainPromptGenderVariant) {
    const candidate = await this.prisma.domainPrompt.findFirst({
      where: { genderVariant, isDisabled: false },
      orderBy: [{ lastServedAt: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;

    return this.prisma.domainPrompt.update({
      where: { id: candidate.id },
      data: { lastServedAt: new Date(), timesServed: { increment: 1 } },
    });
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

  /**
   * Mirrors WordsService.checkAuditHoldThreshold, but counts BOTH
   * WordRecording and DomainConversationRecording toward the same lifetime
   * threshold -- audit holds review a trainer's overall recent submission
   * behavior, not per-task-type, so a trainer alternating between task
   * types should still trip the same hold at the same combined count.
   * Deliberately does not re-send the audit-hold notification email/SMS if
   * WordsService's own check already fired it for this exact crossing --
   * both call sites use the same `count % everyN === 0` guard against the
   * COMBINED count, so only whichever of the two submissions actually
   * crosses the threshold triggers it, not both independently.
   */
  private async checkAuditHoldThreshold(userId: string): Promise<void> {
    const everyN = await this.settings.getAuditHoldEveryNSubmissions();
    if (everyN <= 0) return;

    const [wordCount, domainConversationCount] = await Promise.all([
      this.prisma.wordRecording.count({ where: { userId } }),
      this.prisma.domainConversationRecording.count({ where: { userId } }),
    ]);
    const count = wordCount + domainConversationCount;
    if (count === 0 || count % everyN !== 0) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: { auditHoldAt: new Date() },
    });
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

  private async getOwnedAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.domainConversationAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        prompt: true,
        session: { include: { user: { include: { dialect: true, dialectVariant: true } } } },
      },
    });
    if (!assignment) throw new NotFoundException('Domain conversation assignment not found');
    if (assignment.session.userId !== userId) {
      throw new ForbiddenException('Domain conversation assignment does not belong to you');
    }
    return assignment;
  }

  // --- Admin: prompt pool management --------------------------------------
  // Read/curate the DomainPrompt table -- domain-conversation-prompt-job is
  // the primary writer (bulk LLM generation), admins review/edit/backfill
  // from here, mirroring WordsController's admin/* split for the Word bank.

  async listPromptsForAdmin(query: ListDomainPromptsAdminDto) {
    const { page, pageSize, search, domain, genderVariant, disabled } = query;
    const where = {
      isDisabled: disabled,
      ...(search ? { text: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(domain ? { domain } : {}),
      ...(genderVariant ? { genderVariant } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.domainPrompt.findMany({
        where,
        orderBy: [{ scenarioKey: 'asc' }, { genderVariant: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.domainPrompt.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Distinct domain values across all prompts, for the admin UI's domain filter dropdown. */
  async listDistinctDomains(): Promise<string[]> {
    const rows = await this.prisma.domainPrompt.groupBy({ by: ['domain'] });
    return rows.map((row) => row.domain).sort();
  }

  async setPromptDisabled(id: string, disabled: boolean) {
    const prompt = await this.prisma.domainPrompt.update({
      where: { id },
      data: { isDisabled: disabled },
    });
    return { id: prompt.id, isDisabled: prompt.isDisabled };
  }

  async updatePrompt(id: string, dto: UpdateDomainPromptAdminDto) {
    const prompt = await this.prisma.domainPrompt.update({
      where: { id },
      data: {
        ...(dto.domain !== undefined ? { domain: dto.domain } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
      },
    });
    return prompt;
  }

  /** Manual creation of a full scenario (3 variants), lets an admin backfill/override the pool without waiting on the cron job. */
  async createPrompt(dto: CreateDomainPromptAdminDto) {
    const existing = await this.prisma.domainPrompt.findFirst({
      where: { scenarioKey: dto.scenarioKey },
      select: { id: true },
    });
    if (existing) {
      throw new UnprocessableEntityException('A scenario with this scenarioKey already exists');
    }
    await this.prisma.domainPrompt.createMany({
      data: [
        {
          scenarioKey: dto.scenarioKey,
          domain: dto.domain,
          genderVariant: DomainPromptGenderVariant.NEUTRAL,
          text: dto.neutralText,
          source: 'manual',
        },
        {
          scenarioKey: dto.scenarioKey,
          domain: dto.domain,
          genderVariant: DomainPromptGenderVariant.MALE,
          text: dto.maleText,
          source: 'manual',
        },
        {
          scenarioKey: dto.scenarioKey,
          domain: dto.domain,
          genderVariant: DomainPromptGenderVariant.FEMALE,
          text: dto.femaleText,
          source: 'manual',
        },
      ],
    });
    return this.prisma.domainPrompt.findMany({ where: { scenarioKey: dto.scenarioKey } });
  }

  /** Blocks delete if the prompt still has unsettled recordings against it or an open assignment, same posture as WordsController.hasUnsettledWordActivity. */
  async deletePrompt(id: string) {
    const [unsettledRecording, openAssignment] = await Promise.all([
      this.prisma.domainConversationRecording.findFirst({
        where: { promptId: id, status: { in: ['PENDING', 'TRANSCRIBED', 'SCORED'] } },
        select: { id: true },
      }),
      this.prisma.domainConversationAssignment.findFirst({
        where: { promptId: id, consumedAt: null },
        select: { id: true },
      }),
    ]);
    if (unsettledRecording || openAssignment) {
      throw new UnprocessableEntityException(
        'This prompt has recordings awaiting scoring/settlement or an open assignment -- wait for those to resolve before deleting',
      );
    }
    await this.prisma.domainPrompt.delete({ where: { id } });
    return { id, deleted: true };
  }
}
