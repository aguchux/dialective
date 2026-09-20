import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdminAuditStatus, OtpPurpose, adjustAdminWallet } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OtpService } from '../otp/otp.service';
import { resolveOtpDestination } from '../otp/otp.util';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { AsrRegistryService } from '../asr-registry/asr-registry.service';
import { adminActionContextHash } from '../wallet/otp-context.util';
import { ListTrainerRecordingsDto } from './dto/list-trainer-recordings.dto';
import { ListAllRecordingsDto } from './dto/list-all-recordings.dto';
import { AuditRecordingDto } from './dto/audit-recording.dto';

export type WordDetail = { word: string; start: number; end: number; conf: number | null };

/** Shape of WordRecording.prosodyMetrics, written by quality-gate-worker's expression.py when PlatformSettings.speechExpressionEnabled is on. */
export type ProsodyMetrics = {
  speechRateEstimate: number | null;
  meanPitchHz: number | null;
  pitchStdHz: number | null;
  meanRmsDb: number | null;
  rmsStdDb: number | null;
  pauseRatio: number | null;
};

/**
 * Admin-facing recording audit: lets an admin page through one trainer's
 * WordRecording rows, play back the audio via a presigned URL, and mark each
 * one VALID/INVALID. Marking INVALID can optionally claw back an
 * already-settled payout via adjustAdminWallet -- the same helper/ledger
 * path WalletController's admin wallet-adjustment route uses, OTP-gated the
 * same way when PlatformSettings.adminPayoutOtpEnabled is on.
 */
@Injectable()
export class AdminRecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly otp: OtpService,
    private readonly settings: PlatformSettingsService,
    private readonly asrRegistry: AsrRegistryService,
  ) {}

  /**
   * Per-dialect ASR coverage: which dialects recordings are arriving in,
   * and whether anything is actually transcribing them.
   *
   * Exists because an unmapped dialect fails SILENTLY -- api omits
   * asr_stream, no worker sees the recording, and it ends up with no
   * transcript while nothing errors. 17 dialects and 82k recordings sat
   * that way for a month before anyone noticed, and the only reason it
   * surfaced was someone asking why one language looked wrong.
   *
   * Ordered by volume so the biggest hole is the first row. `transcribed`
   * counts real transcripts rather than trusting the registry: a mapped
   * dialect whose checkpoint fails to load looks identical to an unmapped
   * one from the trainer's side, and this view should show that.
   */
  async asrCoverage() {
    const rows = await this.prisma.wordRecording.groupBy({
      by: ['dialectTag'],
      _count: { _all: true },
    });

    const transcribed = await this.prisma.wordRecording.groupBy({
      by: ['dialectTag'],
      where: { transcript: { not: null } },
      _count: { _all: true },
    });
    const transcribedByTag = new Map(transcribed.map((r) => [r.dialectTag, r._count._all]));

    const dialects = await this.prisma.dialect.findMany({ select: { tag: true, name: true } });
    const nameByTag = new Map(dialects.map((d) => [d.tag, d.name]));

    return rows
      .map((row) => {
        const route = this.asrRegistry.resolve(row.dialectTag);
        const total = row._count._all;
        const withTranscript = transcribedByTag.get(row.dialectTag) ?? 0;
        return {
          dialectTag: row.dialectTag,
          name: nameByTag.get(row.dialectTag) ?? null,
          recordings: total,
          transcribed: withTranscript,
          coveragePercent: total > 0 ? Math.round((withTranscript / total) * 1000) / 10 : 0,
          mapped: !!route,
          engine: route?.engine ?? null,
          checkpoint: route?.checkpoint ?? null,
        };
      })
      .sort((a, b) => b.recordings - a.recordings);
  }

  async listForTrainer(trainerId: string, query: ListTrainerRecordingsDto) {
    const skip = (query.page - 1) * query.pageSize;
    const where = { userId: trainerId };
    const [rows, total] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
        include: { word: { select: { text: true } }, sentence: { select: { text: true } } },
      }),
      this.prisma.wordRecording.count({ where }),
    ]);

    const items = await Promise.all(rows.map((row) => this.toWordRecordingSummary(row)));

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * Platform-wide recording list for the "all recordings" admin datatable --
   * unlike listForTrainer, this queries potentially the whole table, so it
   * uses real DB-level where/orderBy/skip/take rather than an in-memory
   * merge+slice.
   */
  async listAll(query: ListAllRecordingsDto) {
    const skip = (query.page - 1) * query.pageSize;
    const orderBy = { [query.sortBy]: query.sortDir };

    const where = this.buildWordRecordingWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
        include: {
          word: { select: { text: true } },
          sentence: { select: { text: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.wordRecording.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => this.toWordRecordingSummary(row, row.user)));
    return this.paginated(items, query, total);
  }

  private paginated<T>(items: T[], query: ListAllRecordingsDto, total: number) {
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private buildScoreRange(query: ListAllRecordingsDto) {
    if (query.minScore === undefined && query.maxScore === undefined) return undefined;
    const range: { gte?: number; lte?: number } = {};
    if (query.minScore !== undefined) range.gte = query.minScore;
    if (query.maxScore !== undefined) range.lte = query.maxScore;
    return range;
  }

  private buildAuditFilter(query: ListAllRecordingsDto) {
    if (query.reviewState === 'unreviewed') return null;
    if (query.adminAuditStatus) return query.adminAuditStatus;
    return undefined;
  }

  private buildWordRecordingWhere(query: ListAllRecordingsDto) {
    const scoreRange = this.buildScoreRange(query);
    const auditFilter = this.buildAuditFilter(query);
    return {
      ...(query.dialectTag ? { dialectTag: query.dialectTag } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(auditFilter !== undefined ? { adminAuditStatus: auditFilter } : {}),
      ...(scoreRange ? { score: scoreRange } : {}),
      ...(query.search
        ? {
            OR: [
              { word: { text: { contains: query.search, mode: 'insensitive' as const } } },
              { sentence: { text: { contains: query.search, mode: 'insensitive' as const } } },
              { translationText: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  async requestAuditClawbackOtp(adminId: string, recordingId: string) {
    const record = await this.getRecordOrThrow(recordingId);
    if (!record.payoutTokenAmount) {
      throw new UnprocessableEntityException('This recording has no payout to claw back');
    }
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const { destination, channel } = await resolveOtpDestination(admin, this.settings);
    const contextHash = adminActionContextHash({
      action: 'recording-audit-clawback',
      kind: 'word',
      recordingId,
      tokenAmount: -record.payoutTokenAmount.toNumber(),
    });
    return this.otp.issueForUser(
      adminId,
      OtpPurpose.ADMIN_PAYOUT,
      destination,
      contextHash,
      channel,
    );
  }

  async audit(adminId: string, recordingId: string, dto: AuditRecordingDto) {
    const record = await this.getRecordOrThrow(recordingId);

    const wantsClawback =
      dto.status === AdminAuditStatus.INVALID && dto.clawback && record.payoutTokenAmount;
    if (wantsClawback) {
      const tokenAmount = -record.payoutTokenAmount!.toNumber();
      if (await this.settings.isAdminPayoutOtpEnabled()) {
        if (!dto.otpRequestId || !dto.code) {
          throw new UnprocessableEntityException(
            'OTP verification is required to claw back this payout',
          );
        }
        await this.otp.verify({
          otpRequestId: dto.otpRequestId,
          userId: adminId,
          purpose: OtpPurpose.ADMIN_PAYOUT,
          code: dto.code,
          contextHash: adminActionContextHash({
            action: 'recording-audit-clawback',
            kind: 'word',
            recordingId,
            tokenAmount,
          }),
        });
      }
      try {
        await adjustAdminWallet(
          this.prisma,
          record.userId!,
          tokenAmount,
          `recording-audit:word:${recordingId}`,
        );
      } catch (err) {
        if (err instanceof Error && err.message === 'Insufficient wallet balance for this debit') {
          throw new UnprocessableEntityException(
            'Trainer balance is too low to claw back this payout',
          );
        }
        throw err;
      }
    }

    const data = { adminAuditStatus: dto.status, adminAuditedAt: new Date() };
    const updated = await this.prisma.wordRecording.update({ where: { id: recordingId }, data });

    return {
      id: recordingId,
      kind: 'word' as const,
      adminAuditStatus: updated.adminAuditStatus,
      adminAuditedAt: updated.adminAuditedAt,
      clawedBack: Boolean(wantsClawback),
    };
  }

  private async getRecordOrThrow(id: string) {
    const recording = await this.prisma.wordRecording.findUnique({ where: { id } });
    if (!recording) throw new NotFoundException('Recording not found');
    if (!recording.userId) throw new ForbiddenException('This recording has no owning trainer');
    return recording;
  }

  private async toWordRecordingSummary(
    recording: Awaited<
      ReturnType<AdminRecordingsService['prisma']['wordRecording']['findMany']>
    >[number] & {
      word: { text: string } | null;
      sentence: { text: string } | null;
    },
    trainer?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null,
  ) {
    return {
      id: recording.id,
      kind: 'word' as const,
      trainer: trainer
        ? {
            id: trainer.id,
            email: trainer.email,
            firstName: trainer.firstName,
            lastName: trainer.lastName,
          }
        : null,
      direction: recording.direction,
      promptText:
        recording.direction === 'ENGLISH_TO_DIALECT'
          ? (recording.word?.text ?? recording.sentence?.text ?? recording.translationText)
          : `Translate: ${recording.translationText}`,
      responseText: recording.translationText,
      asrTranscript: recording.transcript,
      dialectTag: recording.dialectTag,
      status: recording.status,
      tokensSpent: recording.tokensSpent.toString(),
      rawScore: recording.rawScore?.toString() ?? null,
      score: recording.score?.toString() ?? null,
      noiseScore: recording.noiseScore?.toString() ?? null,
      qualityScore: recording.qualityScore?.toString() ?? null,
      livenessScore: recording.livenessScore?.toString() ?? null,
      emotion: recording.emotion,
      emotionConfidence: recording.emotionConfidence?.toString() ?? null,
      tone: recording.tone,
      style: recording.style,
      speed: recording.speed,
      energy: recording.energy,
      prosodyMetrics: recording.prosodyMetrics as ProsodyMetrics | null,
      expressionCheckedAt: recording.expressionCheckedAt,
      compositeScore: recording.compositeScore?.toString() ?? null,
      payoutTokenAmount: recording.payoutTokenAmount?.toString() ?? null,
      audioUrl:
        recording.audioBucket && recording.audioKey
          ? (
              await this.storage.createPresignedDownloadUrl(
                recording.audioBucket,
                recording.audioKey,
              )
            ).url
          : null,
      asrWordDetail: recording.asrWordDetail as WordDetail[] | null,
      asrMatchScore: recording.asrMatchScore?.toString() ?? null,
      rejectionReason: null as string | null,
      adminAuditStatus: recording.adminAuditStatus,
      adminAuditedAt: recording.adminAuditedAt,
      createdAt: recording.createdAt,
      scoredAt: recording.scoredAt,
      settledAt: recording.settledAt,
    };
  }
}
