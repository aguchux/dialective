import {
  Body,
  ForbiddenException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../auth/strategies/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';
import { RedisStreamsService } from '../redis-streams/redis-streams.service';
import { AsrRegistryService } from '../asr-registry/asr-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CoursesService } from '../courses/courses.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ListSubmissionsDto } from './dto/list-submissions.dto';
import { countPromptWords } from '../common/prompt-length.util';
import { AUDIT_HOLD_MESSAGE, isOnAuditHold } from '../common/audit-hold.util';

const SUBMISSIONS_BUCKET = process.env.SPACES_SUBMISSIONS_BUCKET ?? 'dialectiva-submissions';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};
const SUBMISSION_KEY_PATTERN = /^[a-z0-9-]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(wav|webm|ogg)$/i;

@Controller('submissions')
export class SubmissionsController {
  constructor(
    private readonly storage: StorageService,
    private readonly streams: RedisStreamsService,
    private readonly asrRegistry: AsrRegistryService,
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly courses: CoursesService,
  ) {}

  /**
   * Issues a presigned Spaces upload URL for a new submission. The trainer's
   * client PUTs audio bytes directly to `url`; audio never transits `api`.
   * Caller then POSTs the returned `submissionId`/`key` to `create` to
   * debit tokens, persist the row, and enqueue the asr-jobs message. No
   * Postgres write here -- the audio isn't uploaded yet at this point, so a
   * row would risk being orphaned on client abandonment.
   */
  @Post('upload-url')
  @UseGuards(JwtAuthGuard)
  async createUploadUrl(@Body() body: CreateUploadUrlDto) {
    const route = this.asrRegistry.resolve(body.dialectTag);
    if (!route) {
      throw new UnprocessableEntityException(`Unsupported dialect: ${body.dialectTag}`);
    }

    const prompt = await this.prisma.prompt.findFirst({
      where: { id: body.promptId, dialectTag: body.dialectTag, active: true },
      select: { id: true, text: true },
    });
    if (!prompt) {
      throw new NotFoundException('Prompt not found');
    }

    const submissionId = randomUUID();
    const extension = EXTENSION_BY_CONTENT_TYPE[body.contentType];
    const key = `${body.dialectTag}/${body.promptId}/${submissionId}.${extension}`;

    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      SUBMISSIONS_BUCKET,
      key,
      body.contentType,
    );

    // Returned so the trainer's client sets its recording countdown to the
    // SAME value create() below will pass to quality-gate-worker's
    // prefilter (max_duration_s) -- see getDictationMaxRecordingSeconds.
    // Computed here (not just at create time) so the UI can show the
    // countdown before the trainer starts recording, not only after.
    const maxRecordingSeconds = await this.platformSettings.getDictationMaxRecordingSeconds(
      countPromptWords(prompt.text),
    );

    return {
      submissionId,
      uploadUrl: url,
      key,
      bucket: SUBMISSIONS_BUCKET,
      expiresInSeconds,
      maxRecordingSeconds,
    };
  }

  /**
   * Debits the trainer's wallet for the task cost, inserts the Submission
   * row, then enqueues an asr-jobs-<engine> message once the trainer's
   * client has finished PUTting audio to the presigned URL from
   * `upload-url`. Which stream depends on dialect_tag -> engine routing in
   * models/asr-registry.yaml (see AGENTS.md "ASR engine routing") --
   * rejected up front here, before ever reaching a worker, if the dialect
   * has no registered engine. The owning worker (vosk-worker or
   * whisper-worker) transcribes and writes the result directly to this
   * Submission row (see AGENTS.md "Database access"); `result` below still
   * reads the short-lived Redis scratch key for fast client polling
   * immediately after upload, separate from the long consensus/settlement
   * horizon.
   *
   * Requires auth (added alongside the token debit -- there is no
   * anonymous submission path once submitting costs tokens; see
   * authenticated clients only).
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateSubmissionDto) {
    // Same audit-hold gate as WordsService.nextAssignment -- checked here
    // too since sentence submissions are a separate task-entry point that
    // never goes through a words session. Sentence submissions don't
    // themselves count toward the audit-hold threshold (WordRecording-only,
    // per PlatformSettings.auditHoldEveryNSubmissions), but a held trainer
    // still can't use this path to route around the hold.
    const trainerHoldCheck = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { auditHoldAt: true, auditHoldReleasedAt: true },
    });
    if (!trainerHoldCheck) throw new NotFoundException('Trainer not found');
    if (isOnAuditHold(trainerHoldCheck)) {
      throw new ForbiddenException(AUDIT_HOLD_MESSAGE);
    }

    // Same compliance gate as WordsService.startSession -- checked here too
    // since sentence submissions are a separate task-entry point that
    // doesn't go through a words session at all.
    const incompleteRequired = await this.courses.getIncompleteRequiredCourses(req.user.sub);
    if (incompleteRequired.length > 0) {
      throw new ForbiddenException({
        message: 'Complete the required course(s) below before you can submit training tasks.',
        requiredCourses: incompleteRequired,
      });
    }

    if (body.bucket !== SUBMISSIONS_BUCKET || !SUBMISSION_KEY_PATTERN.test(body.audioKey)) {
      throw new ForbiddenException('Submission upload does not match an issued upload target');
    }
    const expectedKeyPrefix = `${body.dialectTag}/${body.promptId}/${body.submissionId}.`;
    if (!body.audioKey.startsWith(expectedKeyPrefix)) {
      throw new ForbiddenException('Submission upload does not belong to this prompt');
    }

    const route = this.asrRegistry.resolve(body.dialectTag);
    if (!route) {
      throw new UnprocessableEntityException(`Unsupported dialect: ${body.dialectTag}`);
    }

    const prompt = await this.prisma.prompt.findFirst({
      where: { id: body.promptId, dialectTag: body.dialectTag, active: true },
    });
    if (!prompt) {
      throw new NotFoundException('Prompt not found');
    }

    const taskTokenCost = await this.platformSettings.getTaskTokenCost();

    // Server-resolved, never client-supplied -- same reasoning as every
    // other identity-derived field here (userId, wallet). A trainer's
    // dialectVariantId only ever comes from their own profile, and only
    // counts here if it actually belongs to the dialect being submitted
    // against (compared by tag, since that's what this submission is
    // scoped by) -- a variant of a different dialect never gets stamped.
    const trainer = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        dialectVariantId: true,
        dialectVariant: { select: { dialect: { select: { tag: true } } } },
      },
    });
    const dialectVariantId =
      trainer?.dialectVariant?.dialect.tag === body.dialectTag ? trainer.dialectVariantId : null;

    // Ensure the wallet row exists first (brand-new trainers have none yet)
    // so the atomic debit below always has a row to match against.
    const wallet = await this.prisma.wallet.upsert({
      where: { userId: req.user.sub },
      update: {},
      create: { userId: req.user.sub },
    });

    // updateMany's WHERE (not a read-then-compare) makes the lock safe
    // under concurrent requests -- same atomic-guard pattern as
    // WalletController.createWithdrawal. The wallet lock, ledger entry,
    // and submission row are one transaction, so duplicate or rejected
    // submissions cannot leave orphaned token locks. This moves
    // taskTokenCost from spendable balance into lockedBalance rather than
    // debiting it outright -- see Wallet.lockedBalance; the lock releases
    // back to balance on REJECTED (settlement-job's refund sweep) or is
    // replaced by the full no-loss payout on SCORED (settlement).
    const locked = await this.prisma.$transaction(async (tx) => {
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

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'TASK_LOCK',
          amount: -taskTokenCost,
          reference: body.submissionId,
        },
      });

      await tx.submission.create({
        data: {
          id: body.submissionId,
          userId: req.user.sub,
          promptId: body.promptId,
          dialectTag: body.dialectTag,
          dialectVariantId,
          audioBucket: body.bucket,
          audioKey: body.audioKey,
          status: 'PENDING',
          tokensSpent: taskTokenCost,
        },
      });

      return true;
    });
    if (!locked) throw new UnprocessableEntityException('Unable to lock task tokens');

    // Routed through quality-gate-jobs first, not directly to the ASR
    // stream -- quality-gate-worker runs the existing duration/silence
    // prefilter plus noise/quality/liveness scoring, then forwards to
    // asr_stream (the same route.stream resolved above) only once the
    // clip clears the prefilter. See AGENTS.md/quality-gate-worker docs.
    //
    // max_duration_s is the SAME value createUploadUrl returned to the
    // client for its recording countdown -- this is what makes the
    // server-side prefilter gate actually flex per-prompt (a paragraph-
    // length Prompt gets a longer allowance) rather than trusting only the
    // frontend countdown, which a malicious/buggy client could ignore.
    // quality-gate-worker falls back to its own MAX_DURATION_S constant
    // when this field is absent (e.g. word_recording jobs never set it).
    const maxDurationSeconds = await this.platformSettings.getDictationMaxRecordingSeconds(
      countPromptWords(prompt.text),
    );
    await this.streams.publish('quality-gate-jobs', {
      record_kind: 'submission',
      submission_id: body.submissionId,
      prompt_id: body.promptId,
      dialect_tag: body.dialectTag,
      bucket: body.bucket,
      audio_key: body.audioKey,
      asr_stream: route.stream,
      max_duration_s: String(maxDurationSeconds),
    });

    return { submissionId: body.submissionId, status: 'queued', tokensSpent: taskTokenCost };
  }

  /**
   * Reads the short-TTL result scratch key vosk-worker/whisper-worker write
   * immediately after transcribing -- a fast client-poll mechanism for "is
   * my ASR done yet", separate from the Submission row's longer-lived
   * consensus/settlement lifecycle. Returns 404 while the job is still in
   * flight -- callers poll this until it resolves.
   *
   * The raw Redis payload includes `transcript`/`word_confidences` (see
   * vosk-worker/whisper-worker's write_result) -- deliberately stripped
   * before returning to the trainer. The transcribed text is
   * admin-visible-only (see admin-recordings.service.ts's toSubmissionSummary);
   * a trainer only ever needs to know whether/how their submission resolved,
   * not what ASR heard.
   */
  @Get(':submissionId/result')
  @UseGuards(JwtAuthGuard)
  async getResult(@Req() req: AuthenticatedRequest, @Param('submissionId') submissionId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, userId: req.user.sub },
      select: { id: true },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const raw = await this.streams.get(`result:${submissionId}`);
    if (!raw) {
      throw new NotFoundException('Result not ready yet');
    }
    const {
      transcript: _transcript,
      word_confidences: _wordConfidences,
      ...rest
    } = JSON.parse(raw);
    return rest;
  }

  /**
   * A trainer's own submission history -- prompt text, status, score (once
   * SCORED), and payout (once SETTLED). Backs the dashboard's "My Scores"
   * view.
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async listMine(@Req() req: AuthenticatedRequest, @Query() query: ListSubmissionsDto) {
    const where = {
      userId: req.user.sub,
      ...(query.status ? { status: { in: query.status } } : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        include: { prompt: { select: { text: true } } },
      }),
      this.prisma.submission.count({ where }),
    ]);

    return {
      items: await Promise.all(
        items.map(async (submission) => ({
          id: submission.id,
          promptText: submission.prompt.text,
          dialectTag: submission.dialectTag,
          status: submission.status,
          tokensSpent: submission.tokensSpent.toString(),
          rawScore: submission.rawScore?.toString() ?? null,
          score: submission.score?.toString() ?? null,
          noiseScore: submission.noiseScore?.toString() ?? null,
          qualityScore: submission.qualityScore?.toString() ?? null,
          livenessScore: submission.livenessScore?.toString() ?? null,
          compositeScore: submission.compositeScore?.toString() ?? null,
          payoutTokenAmount: submission.payoutTokenAmount?.toString() ?? null,
          audioUrl:
            submission.audioBucket && submission.audioKey
              ? (
                  await this.storage.createPresignedDownloadUrl(
                    submission.audioBucket,
                    submission.audioKey,
                  )
                ).url
              : null,
          rejectionReason: submission.rejectionReason,
          createdAt: submission.createdAt,
          scoredAt: submission.scoredAt,
          settledAt: submission.settledAt,
        })),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}
