import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { CreateWordRecordingDto } from './dto/create-word-recording.dto';
import { CreateWordRecordingUploadUrlDto } from './dto/create-word-recording-upload-url.dto';
import { ListSubmissionsDto } from '../submissions/dto/list-submissions.dto';

const RECORDINGS_BUCKET = process.env.SPACES_WORD_RECORDINGS_BUCKET ?? 'dialectiva-word-recordings';
const TERMS_VERSION = 'voice-training-v1';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

@Injectable()
export class WordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async startSession(userId: string) {
    const trainer = await this.getTrainer(userId);
    const session = await this.prisma.trainingSession.create({
      data: {
        userId,
        termsVersion: TERMS_VERSION,
        consentedAt: new Date(),
      },
    });

    return {
      sessionId: session.id,
      dialectTag: trainer.dialect!.tag,
      dialectName: trainer.dialect!.name,
      reverseTrainingEnabled: await this.settings.isReverseWordTrainingEnabled(),
      termsVersion: TERMS_VERSION,
    };
  }

  async endSession(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (!session.endedAt) {
      await this.prisma.trainingSession.update({ where: { id: session.id }, data: { endedAt: new Date() } });
    }
    return { ended: true };
  }

  async nextAssignment(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (session.endedAt) throw new ConflictException('This training session has ended');

    const trainer = await this.getTrainer(userId);
    const reverseEnabled = await this.settings.isReverseWordTrainingEnabled();
    const reverseSource = reverseEnabled && Math.random() >= 0.5
      ? await this.pickReverseSource(userId, sessionId, trainer.dialect!.tag)
      : null;

    if (reverseSource) {
      const assignment = await this.prisma.wordTrainingAssignment.create({
        data: {
          sessionId,
          wordId: reverseSource.wordId,
          direction: 'DIALECT_TO_ENGLISH',
          sourceRecordingId: reverseSource.id,
        },
      });
      return {
        assignmentId: assignment.id,
        direction: assignment.direction,
        promptText: reverseSource.translationText,
        sourceLanguage: trainer.dialect!.name,
        responseLanguage: 'English',
      };
    }

    const count = await this.prisma.word.count();
    if (count === 0) throw new NotFoundException('No words available');
    const [word] = await this.prisma.word.findMany({ take: 1, skip: Math.floor(Math.random() * count) });
    const assignment = await this.prisma.wordTrainingAssignment.create({
      data: { sessionId, wordId: word.id, direction: 'ENGLISH_TO_DIALECT' },
    });
    return {
      assignmentId: assignment.id,
      direction: assignment.direction,
      promptText: word.text,
      sourceLanguage: 'English',
      responseLanguage: trainer.dialect!.name,
    };
  }

  async createUploadUrl(userId: string, body: CreateWordRecordingUploadUrlDto) {
    const assignment = await this.getOwnedAssignment(userId, body.assignmentId);
    if (assignment.consumedAt) throw new ConflictException('This word has already been submitted');

    const extension = EXTENSION_BY_CONTENT_TYPE[body.contentType];
    const key = `${assignment.session.user.dialect!.tag}/${assignment.direction.toLowerCase()}/${assignment.id}/${randomUUID()}.${extension}`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      RECORDINGS_BUCKET,
      key,
      body.contentType,
    );

    await this.prisma.wordTrainingAssignment.update({
      where: { id: assignment.id },
      data: { uploadBucket: RECORDINGS_BUCKET, uploadKey: key },
    });
    return { uploadUrl: url, key, bucket: RECORDINGS_BUCKET, expiresInSeconds };
  }

  /**
   * DIALECT_TO_ENGLISH self-scores immediately (exact-match against the
   * known English word is the ground truth). ENGLISH_TO_DIALECT has no
   * ground truth of its own -- it stays PENDING/unscored until a peer's
   * reverse-validation recording lands (see scoreReverseValidatedSource),
   * same "wait for independent corroboration" shape as Submission's
   * consensus quorum, just without needing N>=quorum peers -- one
   * reverse-validation is enough since it's a binary exact-match check, not
   * an agreement-ratio computation.
   */
  async createRecording(userId: string, body: CreateWordRecordingDto) {
    const assignment = await this.getOwnedAssignment(userId, body.assignmentId);
    if (assignment.consumedAt) throw new ConflictException('This word has already been submitted');
    if (!assignment.uploadBucket || !assignment.uploadKey) {
      throw new UnprocessableEntityException('Upload the recording before submitting it');
    }
    if (assignment.uploadBucket !== body.bucket || assignment.uploadKey !== body.audioKey) {
      throw new ForbiddenException('Recording upload does not belong to this assignment');
    }

    const normalizedAnswer = normalizeAnswer(body.responseText);
    const normalizedEnglish = normalizeAnswer(assignment.word.text);
    const validationScore = assignment.direction === 'DIALECT_TO_ENGLISH'
      ? normalizedAnswer === normalizedEnglish ? 1 : 0
      : null;
    const score = validationScore !== null ? validationScore * 100 : null;

    const taskTokenCost = await this.settings.getTaskTokenCost();
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const recording = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.wordTrainingAssignment.updateMany({
        where: { id: assignment.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) throw new ConflictException('This word has already been submitted');

      // Same atomic-guard debit pattern as SubmissionsController.create --
      // updateMany's WHERE makes it safe under concurrent requests.
      const debit = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: taskTokenCost } },
        data: { balance: { decrement: taskTokenCost } },
      });
      if (debit.count === 0) {
        throw new UnprocessableEntityException(`Insufficient balance: this task costs ${taskTokenCost} tokens`);
      }

      const created = await tx.wordRecording.create({
        data: {
          wordId: assignment.wordId,
          userId,
          sessionId: assignment.sessionId,
          assignmentId: assignment.id,
          direction: assignment.direction,
          dialectTag: assignment.session.user.dialect!.tag,
          translationText: body.responseText.trim(),
          audioBucket: body.bucket,
          audioKey: body.audioKey,
          durationMs: body.durationMs,
          noiseRating: body.noiseRating,
          validationScore,
          tokensSpent: taskTokenCost,
          score,
          status: score !== null ? 'SCORED' : 'PENDING',
          scoredAt: score !== null ? new Date() : null,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'TASK_SPEND',
          amount: -taskTokenCost,
          reference: created.id,
        },
      });

      return created;
    });

    if (assignment.direction === 'DIALECT_TO_ENGLISH' && assignment.sourceRecordingId) {
      await this.scoreReverseValidatedSource(assignment.sourceRecordingId, validationScore!);
    }

    return {
      recordingId: recording.id,
      status: 'saved',
      direction: recording.direction,
      validationScore: recording.validationScore?.toNumber() ?? null,
    };
  }

  /**
   * A trainer's own word-training recordings -- same shape as
   * SubmissionsController.listMine's /mine so the dashboard's My
   * Tasks/My Scores views can merge both lists. translationText stands in
   * for promptText (the word's own text isn't loaded here to avoid an
   * extra join; translationText is what the trainer actually produced,
   * which is the more useful column to show anyway).
   */
  async listMine(userId: string, query: ListSubmissionsDto) {
    const where = { userId, ...(query.status ? { status: { in: query.status } } : {}) };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        include: { word: { select: { text: true } } },
      }),
      this.prisma.wordRecording.count({ where }),
    ]);

    return {
      items: await Promise.all(items.map(async (recording) => ({
        id: recording.id,
        promptText:
          recording.direction === 'ENGLISH_TO_DIALECT'
            ? recording.word.text
            : `Translate: ${recording.translationText}`,
        dialectTag: recording.dialectTag,
        status: recording.status,
        tokensSpent: recording.tokensSpent.toString(),
        score: recording.score?.toString() ?? null,
        payoutTokenAmount: recording.payoutTokenAmount?.toString() ?? null,
        audioUrl: (await this.storage.createPresignedDownloadUrl(recording.audioBucket, recording.audioKey)).url,
        rejectionReason: null as string | null,
        createdAt: recording.createdAt,
        scoredAt: recording.scoredAt,
        settledAt: recording.settledAt,
      }))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /**
   * A DIALECT_TO_ENGLISH recording that reverse-validates a peer's
   * ENGLISH_TO_DIALECT source scores that source recording: exact-match
   * (validationScore=1) means the peer's dialect translation round-tripped
   * correctly, so the source is marked correct; a miss is inconclusive
   * (the reverse-validator, not the source, may be wrong) so the source is
   * left PENDING for a future reverse-validation attempt rather than scored
   * 0 -- avoids punishing a correct translation for someone else's bad
   * transcription back to English.
   */
  private async scoreReverseValidatedSource(sourceRecordingId: string, reverseValidationScore: number) {
    if (reverseValidationScore < 1) return;
    await this.prisma.wordRecording.updateMany({
      where: { id: sourceRecordingId, status: 'PENDING' },
      data: { score: 100, status: 'SCORED', scoredAt: new Date() },
    });
  }

  private async getTrainer(userId: string) {
    const trainer = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { dialect: true },
    });
    if (!trainer) throw new NotFoundException('Trainer not found');
    if (!trainer.dialect) throw new UnprocessableEntityException('Complete dialect onboarding before training');
    return trainer;
  }

  private async getOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Training session not found');
    if (session.userId !== userId) throw new ForbiddenException('Training session does not belong to you');
    return session;
  }

  private async getOwnedAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.wordTrainingAssignment.findUnique({
      where: { id: assignmentId },
      include: { word: true, session: { include: { user: { include: { dialect: true } } } } },
    });
    if (!assignment) throw new NotFoundException('Word assignment not found');
    if (assignment.session.userId !== userId) throw new ForbiddenException('Word assignment does not belong to you');
    return assignment;
  }

  private async pickReverseSource(userId: string, sessionId: string, dialectTag: string) {
    const usedSources = await this.prisma.wordTrainingAssignment.findMany({
      where: { sessionId, sourceRecordingId: { not: null } },
      select: { sourceRecordingId: true },
    });
    const where = {
      id: { notIn: usedSources.flatMap(({ sourceRecordingId }) => sourceRecordingId ? [sourceRecordingId] : []) },
      dialectTag,
      direction: 'ENGLISH_TO_DIALECT' as const,
      userId: { not: userId },
      noiseRating: { not: 'NOISY' as const },
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
}

function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase('en').replace(/[^a-z0-9\s'-]/g, '').replace(/\s+/g, ' ');
}
