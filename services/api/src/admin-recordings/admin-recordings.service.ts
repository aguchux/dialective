import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminAuditStatus, OtpPurpose, adjustAdminWallet } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OtpService } from '../otp/otp.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { adminActionContextHash } from '../wallet/otp-context.util';
import { ListTrainerRecordingsDto } from './dto/list-trainer-recordings.dto';
import { ListAllRecordingsDto } from './dto/list-all-recordings.dto';
import { AuditRecordingDto } from './dto/audit-recording.dto';

export type RecordingKind = 'word' | 'submission';

export type WordDetail = { word: string; start: number; end: number; conf: number | null };

/**
 * Admin-facing recording audit: lets an admin page through one trainer's
 * WordRecording + Submission rows (merged into a single chronological
 * feed), play back the audio via a presigned URL, and mark each one
 * VALID/INVALID. Marking INVALID can optionally claw back an
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
  ) {}

  /**
   * Merges both record types, sorted newest-first, then paginates the
   * merged list in memory. Each trainer's total recording count is bounded
   * (task-taking is throttled by token balance), so this never approaches
   * the scale that would make a merged in-DB pagination worth the added
   * complexity of a UNION query across two Prisma models.
   */
  async listForTrainer(trainerId: string, query: ListTrainerRecordingsDto) {
    const [wordRecordings, submissions] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where: { userId: trainerId },
        orderBy: { createdAt: 'desc' },
        include: { word: { select: { text: true } }, prompt: { select: { text: true } } },
      }),
      this.prisma.submission.findMany({
        where: { userId: trainerId },
        orderBy: { createdAt: 'desc' },
        include: { prompt: { select: { text: true } } },
      }),
    ]);

    const merged = [
      ...wordRecordings.map((recording) => ({ kind: 'word' as const, createdAt: recording.createdAt, recording })),
      ...submissions.map((submission) => ({ kind: 'submission' as const, createdAt: submission.createdAt, submission })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = merged.length;
    const skip = (query.page - 1) * query.pageSize;
    const pageSlice = merged.slice(skip, skip + query.pageSize);

    const items = await Promise.all(pageSlice.map((entry) =>
      entry.kind === 'word' ? this.toWordRecordingSummary(entry.recording) : this.toSubmissionSummary(entry.submission),
    ));

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
   * merge+slice. Scoped to a single kind per request (word or submission):
   * the two models have different filterable fields (direction vs none,
   * word vs prompt text), so a combined view would need a UNION and a
   * lowest-common-denominator filter set for little benefit -- the frontend
   * tab switches kind instead.
   */
  async listAll(query: ListAllRecordingsDto) {
    const skip = (query.page - 1) * query.pageSize;
    const orderBy = { [query.sortBy]: query.sortDir };

    if (query.kind === 'word') {
      const where = this.buildWordRecordingWhere(query);
      const [rows, total] = await Promise.all([
        this.prisma.wordRecording.findMany({
          where,
          orderBy,
          skip,
          take: query.pageSize,
          include: {
            word: { select: { text: true } },
            prompt: { select: { text: true } },
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        }),
        this.prisma.wordRecording.count({ where }),
      ]);
      const items = await Promise.all(rows.map((row) => this.toWordRecordingSummary(row, row.user)));
      return this.paginated(items, query, total);
    }

    const where = this.buildSubmissionWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
        include: {
          prompt: { select: { text: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.submission.count({ where }),
    ]);
    const items = await Promise.all(rows.map((row) => this.toSubmissionSummary(row, row.user)));
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
              { prompt: { text: { contains: query.search, mode: 'insensitive' as const } } },
              { translationText: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  private buildSubmissionWhere(query: ListAllRecordingsDto) {
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
              { prompt: { text: { contains: query.search, mode: 'insensitive' as const } } },
              { transcript: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  async requestAuditClawbackOtp(adminId: string, kind: RecordingKind, recordingId: string) {
    const record = await this.getRecordOrThrow(kind, recordingId);
    if (!record.payoutTokenAmount) {
      throw new UnprocessableEntityException('This recording has no payout to claw back');
    }
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const contextHash = adminActionContextHash({
      action: 'recording-audit-clawback',
      kind,
      recordingId,
      tokenAmount: -record.payoutTokenAmount.toNumber(),
    });
    return this.otp.issueForUser(adminId, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  async audit(adminId: string, kind: RecordingKind, recordingId: string, dto: AuditRecordingDto) {
    const record = await this.getRecordOrThrow(kind, recordingId);

    const wantsClawback = dto.status === AdminAuditStatus.INVALID && dto.clawback && record.payoutTokenAmount;
    if (wantsClawback) {
      const tokenAmount = -record.payoutTokenAmount!.toNumber();
      if (await this.settings.isAdminPayoutOtpEnabled()) {
        if (!dto.otpRequestId || !dto.code) {
          throw new UnprocessableEntityException('OTP verification is required to claw back this payout');
        }
        await this.otp.verify({
          otpRequestId: dto.otpRequestId,
          userId: adminId,
          purpose: OtpPurpose.ADMIN_PAYOUT,
          code: dto.code,
          contextHash: adminActionContextHash({ action: 'recording-audit-clawback', kind, recordingId, tokenAmount }),
        });
      }
      try {
        await adjustAdminWallet(this.prisma, record.userId!, tokenAmount, `recording-audit:${kind}:${recordingId}`);
      } catch (err) {
        if (err instanceof Error && err.message === 'Insufficient wallet balance for this debit') {
          throw new UnprocessableEntityException('Trainer balance is too low to claw back this payout');
        }
        throw err;
      }
    }

    const data = { adminAuditStatus: dto.status, adminAuditedAt: new Date() };
    const updated =
      kind === 'word'
        ? await this.prisma.wordRecording.update({ where: { id: recordingId }, data })
        : await this.prisma.submission.update({ where: { id: recordingId }, data });

    return { id: recordingId, kind, adminAuditStatus: updated.adminAuditStatus, adminAuditedAt: updated.adminAuditedAt, clawedBack: Boolean(wantsClawback) };
  }

  private async getRecordOrThrow(kind: RecordingKind, id: string) {
    if (kind === 'word') {
      const recording = await this.prisma.wordRecording.findUnique({ where: { id } });
      if (!recording) throw new NotFoundException('Recording not found');
      if (!recording.userId) throw new ForbiddenException('This recording has no owning trainer');
      return recording;
    }
    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('Recording not found');
    return submission;
  }

  private async toWordRecordingSummary(
    recording: Awaited<ReturnType<AdminRecordingsService['prisma']['wordRecording']['findMany']>>[number] & {
      word: { text: string } | null;
      prompt: { text: string } | null;
    },
    trainer?: { id: string; email: string; firstName: string | null; lastName: string | null } | null,
  ) {
    return {
      id: recording.id,
      kind: 'word' as const,
      trainer: trainer ? { id: trainer.id, email: trainer.email, firstName: trainer.firstName, lastName: trainer.lastName } : null,
      direction: recording.direction,
      promptText:
        recording.direction === 'SENTENCE_REBUILD'
          ? `Rebuild: ${recording.prompt?.text ?? recording.translationText}`
          : recording.direction === 'ENGLISH_TO_DIALECT'
            ? (recording.word?.text ?? recording.translationText)
            : `Translate: ${recording.translationText}`,
      responseText: recording.translationText,
      dialectTag: recording.dialectTag,
      status: recording.status,
      tokensSpent: recording.tokensSpent.toString(),
      rawScore: recording.rawScore?.toString() ?? null,
      score: recording.score?.toString() ?? null,
      noiseScore: recording.noiseScore?.toString() ?? null,
      qualityScore: recording.qualityScore?.toString() ?? null,
      livenessScore: recording.livenessScore?.toString() ?? null,
      compositeScore: recording.compositeScore?.toString() ?? null,
      payoutTokenAmount: recording.payoutTokenAmount?.toString() ?? null,
      audioUrl:
        recording.audioBucket && recording.audioKey
          ? (await this.storage.createPresignedDownloadUrl(recording.audioBucket, recording.audioKey)).url
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

  private async toSubmissionSummary(
    submission: Awaited<ReturnType<AdminRecordingsService['prisma']['submission']['findMany']>>[number] & {
      prompt: { text: string };
    },
    trainer?: { id: string; email: string; firstName: string | null; lastName: string | null } | null,
  ) {
    return {
      id: submission.id,
      kind: 'submission' as const,
      trainer: trainer ? { id: trainer.id, email: trainer.email, firstName: trainer.firstName, lastName: trainer.lastName } : null,
      direction: null,
      promptText: submission.prompt.text,
      responseText: submission.transcript,
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
          ? (await this.storage.createPresignedDownloadUrl(submission.audioBucket, submission.audioKey)).url
          : null,
      asrWordDetail: submission.asrWordDetail as WordDetail[] | null,
      rejectionReason: submission.rejectionReason,
      adminAuditStatus: submission.adminAuditStatus,
      adminAuditedAt: submission.adminAuditedAt,
      createdAt: submission.createdAt,
      scoredAt: submission.scoredAt,
      settledAt: submission.settledAt,
    };
  }
}
