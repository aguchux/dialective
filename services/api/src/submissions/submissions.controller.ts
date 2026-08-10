import {
  Body,
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
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { ListEarningsDto } from '../wallet/dto/list-earnings.dto';

const SUBMISSIONS_BUCKET = process.env.SPACES_SUBMISSIONS_BUCKET ?? 'dialectiva-submissions';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

@Controller('submissions')
export class SubmissionsController {
  constructor(
    private readonly storage: StorageService,
    private readonly streams: RedisStreamsService,
    private readonly asrRegistry: AsrRegistryService,
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
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
    const submissionId = randomUUID();
    const extension = EXTENSION_BY_CONTENT_TYPE[body.contentType];
    const key = `${body.dialectTag}/${body.promptId}/${submissionId}.${extension}`;

    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      SUBMISSIONS_BUCKET,
      key,
      body.contentType,
    );

    return { submissionId, uploadUrl: url, key, bucket: SUBMISSIONS_BUCKET, expiresInSeconds };
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
    const route = this.asrRegistry.resolve(body.dialectTag);
    if (!route) {
      throw new UnprocessableEntityException(`Unsupported dialect: ${body.dialectTag}`);
    }

    const prompt = await this.prisma.prompt.findUnique({ where: { id: body.promptId } });
    if (!prompt) {
      throw new NotFoundException('Prompt not found');
    }

    const taskTokenCost = await this.platformSettings.getTaskTokenCost();

    // Ensure the wallet row exists first (brand-new trainers have none yet)
    // so the atomic debit below always has a row to match against.
    const wallet = await this.prisma.wallet.upsert({
      where: { userId: req.user.sub },
      update: {},
      create: { userId: req.user.sub },
    });

    // updateMany's WHERE (not a read-then-compare) makes the debit safe
    // under concurrent requests -- same atomic-guard pattern as
    // WalletController.createWithdrawal. Both writes are one $transaction,
    // so if updateMany matches 0 rows, the LedgerEntry create still ran
    // (updateMany matching 0 rows isn't a thrown error) -- delete it
    // explicitly below rather than assume an implicit rollback.
    const [debit] = await this.prisma.$transaction([
      this.prisma.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: taskTokenCost } },
        data: { balance: { decrement: taskTokenCost } },
      }),
      this.prisma.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'TASK_SPEND',
          amount: -taskTokenCost,
          reference: body.submissionId,
        },
      }),
    ]);

    if (debit.count === 0) {
      await this.prisma.ledgerEntry.deleteMany({ where: { reference: body.submissionId, type: 'TASK_SPEND' } });
      throw new UnprocessableEntityException(`Insufficient balance: this task costs ${taskTokenCost} tokens`);
    }

    await this.prisma.submission.create({
      data: {
        id: body.submissionId,
        userId: req.user.sub,
        promptId: body.promptId,
        dialectTag: body.dialectTag,
        audioBucket: body.bucket,
        audioKey: body.audioKey,
        status: 'PENDING',
        tokensSpent: taskTokenCost,
      },
    });

    await this.streams.publish(route.stream, {
      submission_id: body.submissionId,
      prompt_id: body.promptId,
      dialect_tag: body.dialectTag,
      bucket: body.bucket,
      audio_key: body.audioKey,
    });

    return { submissionId: body.submissionId, status: 'queued', tokensSpent: taskTokenCost };
  }

  /**
   * Reads the short-TTL result scratch key vosk-worker/whisper-worker write
   * immediately after transcribing -- a fast client-poll mechanism for "is
   * my ASR done yet", separate from the Submission row's longer-lived
   * consensus/settlement lifecycle. Returns 404 while the job is still in
   * flight -- callers poll this until it resolves.
   */
  @Get(':submissionId/result')
  @UseGuards(JwtAuthGuard)
  async getResult(@Param('submissionId') submissionId: string) {
    const raw = await this.streams.get(`result:${submissionId}`);
    if (!raw) {
      throw new NotFoundException('Result not ready yet');
    }
    return JSON.parse(raw);
  }

  /**
   * A trainer's own submission history -- prompt text, status, score (once
   * SCORED), and payout (once SETTLED). Backs the dashboard's "My Scores"
   * view.
   */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async listMine(@Req() req: AuthenticatedRequest, @Query() query: ListEarningsDto) {
    const where = { userId: req.user.sub };
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
      items: items.map((submission) => ({
        id: submission.id,
        promptText: submission.prompt.text,
        dialectTag: submission.dialectTag,
        status: submission.status,
        score: submission.score?.toString() ?? null,
        payoutTokenAmount: submission.payoutTokenAmount?.toString() ?? null,
        rejectionReason: submission.rejectionReason,
        createdAt: submission.createdAt,
        scoredAt: submission.scoredAt,
        settledAt: submission.settledAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}
