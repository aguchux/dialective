import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { StorageService } from '../storage/storage.service';
import { RedisStreamsService } from '../redis-streams/redis-streams.service';
import { LlmNormalizerService } from '../llm/llm-normalizer.service';
import { parseProviderOrder } from '../llm/llm-provider.interface';
import { CoursesService } from '../courses/courses.service';
import { AsrRegistryService } from '../asr-registry/asr-registry.service';
import { MailService } from '../mail/mail.service';
import { AUDIT_HOLD_MESSAGE, isOnAuditHold } from '../common/audit-hold.util';
import { CreateWordRecordingDto } from './dto/create-word-recording.dto';
import { CreateWordRecordingUploadUrlDto } from './dto/create-word-recording-upload-url.dto';
import { GetSpellingSuggestionsDto } from './dto/get-spelling-suggestions.dto';
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
  private readonly logger = new Logger(WordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
    private readonly streams: RedisStreamsService,
    private readonly llm: LlmNormalizerService,
    private readonly courses: CoursesService,
    private readonly asrRegistry: AsrRegistryService,
    private readonly mail: MailService,
  ) {}

  async startSession(userId: string) {
    await this.assertNotOnAuditHold(userId);

    const incompleteRequired = await this.courses.getIncompleteRequiredCourses(userId);
    if (incompleteRequired.length > 0) {
      throw new ForbiddenException({
        message: 'Complete the required course(s) below before you can start training.',
        requiredCourses: incompleteRequired,
      });
    }

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

    await this.assertNotOnAuditHold(userId);

    // startSession only checks once, at session creation -- sessions have no
    // server-side TTL (see TrainingSession schema), so a trainer who was
    // compliant when the session started, or whose session predates a
    // course being marked required, could otherwise keep pulling new
    // assignments indefinitely without the required-course gate ever firing
    // again. Re-check here, the actual per-task chokepoint, not just at
    // session start.
    const incompleteRequired = await this.courses.getIncompleteRequiredCourses(userId);
    if (incompleteRequired.length > 0) {
      throw new ForbiddenException({
        message: 'Complete the required course(s) below before you can continue training.',
        requiredCourses: incompleteRequired,
      });
    }

    const trainer = await this.getTrainer(userId);
    const reverseEnabled = await this.settings.isReverseWordTrainingEnabled();
    const sentenceRebuildEnabled = await this.settings.isSentenceRebuildEnabled();

    const roll = Math.random();
    const reverseSource = reverseEnabled && roll < 1 / 3
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
      const sourceAudioUrl =
        reverseSource.audioBucket && reverseSource.audioKey
          ? (await this.storage.createPresignedDownloadUrl(reverseSource.audioBucket, reverseSource.audioKey)).url
          : null;
      return {
        assignmentId: assignment.id,
        wordId: reverseSource.wordId,
        direction: assignment.direction,
        promptText: reverseSource.translationText,
        sourceAudioUrl,
        sourceLanguage: trainer.dialect!.name,
        responseLanguage: 'English',
        dialectTag: null as string | null,
        dialectKeyboardLayout: null as string | null,
        fragments: null as { text: string; position: number }[] | null,
      };
    }

    const sentenceRebuild = sentenceRebuildEnabled && roll < 2 / 3
      ? await this.pickSentenceRebuildSource(trainer.dialect!.tag)
      : null;

    if (sentenceRebuild) {
      const assignment = await this.prisma.wordTrainingAssignment.create({
        data: { sessionId, promptId: sentenceRebuild.promptId, direction: 'SENTENCE_REBUILD' },
      });
      return {
        assignmentId: assignment.id,
        wordId: null as string | null,
        direction: assignment.direction,
        promptText: null as string | null,
        sourceLanguage: trainer.dialect!.name,
        responseLanguage: trainer.dialect!.name,
        dialectTag: trainer.dialect!.tag,
        dialectKeyboardLayout: null as string | null,
        fragments: shuffle(sentenceRebuild.fragments.map((text, position) => ({ text, position }))),
      };
    }

    const totalWords = await this.prisma.word.count();
    if (totalWords === 0) {
      // Distinct, stable message the frontend matches on to show a "check
      // back later" empty state instead of a generic error banner -- see
      // WordTrainingDialog.tsx.
      throw new NotFoundException('NO_WORDS_AVAILABLE');
    }
    const word = await this.pickEnglishToDialectWord(userId, totalWords);
    if (!word) throw new NotFoundException('NO_WORDS_AVAILABLE');
    const assignment = await this.prisma.wordTrainingAssignment.create({
      data: { sessionId, wordId: word.id, direction: 'ENGLISH_TO_DIALECT' },
    });
    return {
      assignmentId: assignment.id,
      wordId: word.id,
      direction: assignment.direction,
      promptText: word.text,
      sourceLanguage: 'English',
      responseLanguage: trainer.dialect!.name,
      dialectTag: trainer.dialect!.tag,
      dialectKeyboardLayout: trainer.dialect!.keyboardLayout,
      fragments: null as { text: string; position: number }[] | null,
    };
  }

  async createUploadUrl(userId: string, body: CreateWordRecordingUploadUrlDto) {
    const assignment = await this.getOwnedAssignment(userId, body.assignmentId);
    if (assignment.consumedAt) throw new ConflictException('This word has already been submitted');

    const extension = EXTENSION_BY_CONTENT_TYPE[body.contentType];
    // Variant tag is only unique per-dialect (see DialectVariant's doc
    // comment), so it's always nested under the parent dialect segment
    // here -- never used as a standalone path prefix.
    const dialectPath = assignment.session.user.dialectVariant
      ? `${assignment.session.user.dialect!.tag}/${assignment.session.user.dialectVariant.tag}`
      : assignment.session.user.dialect!.tag;
    const key = `${dialectPath}/${assignment.direction.toLowerCase()}/${assignment.id}/${randomUUID()}.${extension}`;
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
   * an agreement-ratio computation. SENTENCE_REBUILD also self-scores
   * immediately (exact-sequence match against the assignment's known
   * PromptWord order) and has no audio step at all -- see
   * createSentenceRebuildRecording.
   */
  async createRecording(userId: string, body: CreateWordRecordingDto) {
    const assignment = await this.getOwnedAssignment(userId, body.assignmentId);
    if (assignment.consumedAt) throw new ConflictException('This word has already been submitted');

    if (assignment.direction === 'SENTENCE_REBUILD') {
      return this.createSentenceRebuildRecording(userId, assignment, body);
    }

    if (!assignment.uploadBucket || !assignment.uploadKey) {
      throw new UnprocessableEntityException('Upload the recording before submitting it');
    }
    if (assignment.uploadBucket !== body.bucket || assignment.uploadKey !== body.audioKey) {
      throw new ForbiddenException('Recording upload does not belong to this assignment');
    }
    if (!body.responseText || !body.audioKey || !body.bucket || body.durationMs === undefined || !body.noiseRating) {
      throw new UnprocessableEntityException('responseText, bucket, audioKey, durationMs, and noiseRating are required for this assignment');
    }
    if (!assignment.word) {
      throw new UnprocessableEntityException('This assignment has no associated word');
    }

    // Mirrors the client's countdown (see WordTrainingDialog.tsx): per-word
    // seconds x word count in the source text, clamped to the admin's
    // absolute ceiling. A grace factor absorbs MediaRecorder chunking/
    // upload latency between the client's own clamp and this check, so a
    // recording that legitimately finished right at the client's limit
    // isn't rejected for a few hundred ms of transport overhead.
    const [perWordSeconds, maxSeconds] = await Promise.all([
      this.settings.getWordTrainingRecordingTimeoutSeconds(),
      this.settings.getWordTrainingRecordingMaxTimeoutSeconds(),
    ]);
    const wordCount = Math.max(1, assignment.word.text.trim().split(/\s+/).length);
    const allowedMs = Math.min(perWordSeconds * wordCount, maxSeconds) * 1000;
    const durationGraceMs = 5_000;
    if (body.durationMs > allowedMs + durationGraceMs) {
      throw new UnprocessableEntityException(`Recording exceeds the ${Math.round(allowedMs / 1000)}s limit for this word`);
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

      // Same atomic-guard lock pattern as SubmissionsController.create --
      // updateMany's WHERE makes it safe under concurrent requests. Moves
      // taskTokenCost from spendable balance into lockedBalance rather than
      // debiting outright; released back to balance on a stuck-timeout
      // refund or replaced by the no-loss payout once SCORED.
      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: taskTokenCost } },
        data: { balance: { decrement: taskTokenCost }, lockedBalance: { increment: taskTokenCost } },
      });
      if (lock.count === 0) {
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
          dialectVariantId: assignment.session.user.dialectVariantId,
          translationText: body.responseText!.trim(),
          audioBucket: body.bucket,
          audioKey: body.audioKey,
          durationMs: body.durationMs,
          noiseRating: body.noiseRating,
          validationScore,
          tokensSpent: taskTokenCost,
          rawScore: score,
          score,
          status: score !== null ? 'SCORED' : 'PENDING',
          scoredAt: score !== null ? new Date() : null,
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

    if (assignment.direction === 'DIALECT_TO_ENGLISH' && assignment.sourceRecordingId) {
      await this.scoreReverseValidatedSource(assignment.sourceRecordingId, validationScore!);
    }

    if (assignment.direction === 'ENGLISH_TO_DIALECT') {
      await this.normalizeSpellingBestEffort(recording.id, assignment.word.text, assignment.session.user.dialect!.name, body.responseText!.trim());
    }

    // Same quality-gate-jobs stream Submissions publish to (see
    // SubmissionsController.create). Unlike Submissions, an unsupported
    // dialect here is NOT a rejection -- ASR is an optional annotation for
    // word recordings, never a gate on recording creation (there's no
    // equivalent "duration_out_of_range"/"mostly_silence" prefilter-reject
    // path for this model either). asr_stream is simply omitted when the
    // dialect has no registered engine; quality-gate-worker's existing
    // asr_stream-forwarding branch (see quality-gate-worker/worker.py) only
    // fires when the field is present.
    const asrRoute = this.asrRegistry.resolve(assignment.session.user.dialect!.tag);
    await this.streams.publish('quality-gate-jobs', {
      record_kind: 'word_recording',
      word_recording_id: recording.id,
      bucket: body.bucket,
      audio_key: body.audioKey,
      dialect_tag: assignment.session.user.dialect!.tag,
      expected_text: body.responseText!.trim(),
      ...(asrRoute ? { asr_stream: asrRoute.stream } : {}),
    });

    await this.checkAuditHoldThreshold(userId);

    return {
      recordingId: recording.id,
      status: 'saved',
      direction: recording.direction,
      validationScore: recording.validationScore?.toNumber() ?? null,
    };
  }

  /**
   * SENTENCE_REBUILD: no audio, no upload step. The trainer taps
   * PromptWord.position values in the order they believe is correct;
   * scoring compares that submitted sequence against the assignment's own
   * PromptWord.position values in stored (ascending) order -- an exact
   * match scores 100, anything else scores 0. Self-scores immediately
   * (ground truth is known server-side), same no-loss stake-return
   * economics as the other two directions.
   */
  private async createSentenceRebuildRecording(
    userId: string,
    assignment: NonNullable<Awaited<ReturnType<WordsService['getOwnedAssignment']>>>,
    body: CreateWordRecordingDto,
  ) {
    if (!body.submittedOrder || body.submittedOrder.length < 2) {
      throw new UnprocessableEntityException('submittedOrder is required for this assignment');
    }
    if (!assignment.promptId || !assignment.prompt) {
      throw new UnprocessableEntityException('This assignment has no associated prompt');
    }

    const dialectTag = assignment.session.user.dialect!.tag;
    const promptWords = assignment.prompt.words
      .filter((w) => w.dialectTag === dialectTag)
      .sort((a, b) => a.position - b.position);
    if (promptWords.length < 2) {
      throw new UnprocessableEntityException('This assignment has no fragment sequence to score');
    }

    const correctOrder = promptWords.map((w) => w.position);
    const submitted = body.submittedOrder;
    const isExactMatch = submitted.length === correctOrder.length && submitted.every((position, index) => position === correctOrder[index]);
    const score = isExactMatch ? 100 : 0;

    const positionToText = new Map(promptWords.map((w) => [w.position, w.text]));
    const submittedText = submitted.map((position) => positionToText.get(position) ?? '?').join(' ');

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

      const lock = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: taskTokenCost } },
        data: { balance: { decrement: taskTokenCost }, lockedBalance: { increment: taskTokenCost } },
      });
      if (lock.count === 0) {
        throw new UnprocessableEntityException(`Insufficient balance: this task costs ${taskTokenCost} tokens`);
      }

      const created = await tx.wordRecording.create({
        data: {
          wordId: null,
          promptId: assignment.promptId,
          userId,
          sessionId: assignment.sessionId,
          assignmentId: assignment.id,
          direction: 'SENTENCE_REBUILD',
          dialectTag,
          dialectVariantId: assignment.session.user.dialectVariantId,
          translationText: submittedText,
          submittedOrder: submitted,
          tokensSpent: taskTokenCost,
          rawScore: score,
          score,
          validationScore: isExactMatch ? 1 : 0,
          status: 'SCORED',
          scoredAt: new Date(),
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

    await this.checkAuditHoldThreshold(userId);

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
   * which is the more useful column to show anyway). SENTENCE_REBUILD
   * rows have no word/audio -- promptText comes from the linked Prompt,
   * audioUrl is null.
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
        include: { word: { select: { text: true } }, prompt: { select: { text: true } } },
      }),
      this.prisma.wordRecording.count({ where }),
    ]);

    return {
      items: await Promise.all(items.map(async (recording) => ({
        id: recording.id,
        promptText:
          recording.direction === 'SENTENCE_REBUILD'
            ? `Rebuild: ${recording.prompt?.text ?? recording.translationText}`
            : recording.direction === 'ENGLISH_TO_DIALECT'
              ? (recording.word?.text ?? recording.translationText)
              : `Translate: ${recording.translationText}`,
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
   * Best-effort AI spelling normalization for ENGLISH_TO_DIALECT
   * recordings -- writes normalizedTranslationText alongside the trainer's
   * raw translationText, purely informational (never touches
   * validationScore/score/status). Any failure (disabled, all providers
   * down, etc.) is swallowed: this must never fail or delay the
   * already-completed recording submission.
   */
  private async normalizeSpellingBestEffort(recordingId: string, englishWord: string, dialectName: string, typedText: string) {
    try {
      const enabled = await this.settings.isSpellingNormalizationEnabled();
      if (!enabled) return;

      const order = parseProviderOrder(await this.settings.getSpellingNormalizationProviderOrder());
      const prompt = [
        `A language learner attempted to spell the ${dialectName} translation of the English word "${englishWord}".`,
        `Their typed attempt: "${typedText}"`,
        `Correct the spelling into proper ${dialectName} orthography (correct diacritics, letters, and punctuation for ${dialectName}) while preserving the same word/phrase.`,
        'Respond with ONLY the corrected word or phrase, no explanation, no quotes.',
      ].join(' ');

      const normalized = await this.llm.normalize(prompt, order);
      if (!normalized.trim()) return;

      await this.prisma.wordRecording.update({
        where: { id: recordingId },
        data: { normalizedTranslationText: normalized.trim() },
      });
    } catch {
      // Fail-open: normalization is informational-only and must never
      // affect the trainer-facing submission flow.
    }
  }

  /**
   * Typing-suggestion source for the word-training spelling input.
   * Peer-validated spellings (a reverse-validated ENGLISH_TO_DIALECT
   * WordRecording, score=100 -- see scoreReverseValidatedSource) are
   * preferred since they're human-corroborated; word-generator-job's raw
   * LLM WordTranslation rows fill in the remainder when peer-validated
   * coverage is thin, tagged distinctly so the frontend can show trainers
   * which is which.
   *
   * ENGLISH_TO_DIALECT's `score` is binary (100, or never SCORED at all --
   * see scoreReverseValidatedSource's early return below 1) so every
   * candidate row here is already tied at the same score; `compositeScore`
   * (quality-gate's noise/clipping/liveness blend, still real-valued even
   * for a perfect-match recording) is what actually ranks "best" among
   * them. Rows the quality gate hasn't scored yet (compositeScore null,
   * e.g. gate disabled or not yet run) sort after every gated row rather
   * than being excluded -- a peer-validated text with no quality signal
   * yet is still better than falling back to an AI-only suggestion.
   */
  async getSpellingSuggestions(query: GetSpellingSuggestionsDto) {
    const search = query.query?.trim();
    const textFilter = search ? { contains: search, mode: 'insensitive' as const } : undefined;

    const communityRows = await this.prisma.wordRecording.findMany({
      where: {
        wordId: query.wordId,
        dialectTag: query.dialectTag,
        direction: 'ENGLISH_TO_DIALECT',
        status: 'SCORED',
        score: 100,
        ...(textFilter ? { translationText: textFilter } : {}),
      },
      // `distinct` here runs client-side over the ordered result set (Prisma
      // 7's query-compiler engine, no `nativeDistinct`/DISTINCT ON pushdown
      // for this shape), keeping the first row per translationText in the
      // order below -- so orderBy leading with compositeScore, not
      // translationText, is deliberate and correct, not a Postgres
      // "DISTINCT ON expressions must match ORDER BY" violation. Don't
      // reorder this to put translationText first to "fix" it.
      distinct: ['translationText'],
      orderBy: [{ compositeScore: { sort: 'desc', nulls: 'last' } }, { scoredAt: 'desc' }],
      select: { translationText: true },
      take: 8,
    });

    const suggestions: { text: string; source: 'community' | 'ai' }[] = communityRows.map((row) => ({
      text: row.translationText,
      source: 'community' as const,
    }));

    const remaining = 8 - suggestions.length;
    if (remaining > 0) {
      const seen = new Set(suggestions.map((s) => s.text.toLowerCase()));
      const aiRows = await this.prisma.wordTranslation.findMany({
        where: {
          wordId: query.wordId,
          dialectTag: query.dialectTag,
          ...(textFilter ? { text: textFilter } : {}),
        },
        select: { text: true },
        take: remaining + suggestions.length,
      });
      for (const row of aiRows) {
        if (suggestions.length >= 8) break;
        if (seen.has(row.text.toLowerCase())) continue;
        seen.add(row.text.toLowerCase());
        suggestions.push({ text: row.text, source: 'ai' });
      }
    }

    return { suggestions };
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
      data: { rawScore: 100, score: 100, status: 'SCORED', scoredAt: new Date() },
    });
  }

  /**
   * Distinct from status (SUSPENDED/BLOCKED, enforced only at re-auth --
   * see AuthService.assertActive) -- this blocks the submission endpoints
   * directly, since an automatic audit hold needs to take effect
   * immediately on an already-issued access token, not just on next login.
   */
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
   * Fires after every successful WordRecording creation (word-training AND
   * SENTENCE_REBUILD -- both increment the same count). Auto-puts the
   * trainer on an audit hold the instant their lifetime WordRecording count
   * crosses a multiple of PlatformSettings.auditHoldEveryNSubmissions --
   * pure `count % N === 0` on the lifetime total, so this re-triggers at
   * every next multiple (500, 1000, 1500, ...) regardless of how many holds
   * happened in between; there is no separate "since last release" counter.
   * The triggering submission itself is never blocked -- only the NEXT
   * nextAssignment/create call hits assertNotOnAuditHold. 0 disables the
   * feature outright (see schema doc comment).
   */
  private async checkAuditHoldThreshold(userId: string): Promise<void> {
    const everyN = await this.settings.getAuditHoldEveryNSubmissions();
    if (everyN <= 0) return;

    const count = await this.prisma.wordRecording.count({ where: { userId } });
    if (count === 0 || count % everyN !== 0) return;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { auditHoldAt: new Date() },
      select: { email: true },
    });

    try {
      await this.mail.sendAuditHoldStartedEmail({ trainerEmail: user.email, submissionCount: count });
    } catch (err) {
      // Best-effort, same as every other post-action email in this codebase
      // -- the hold has already been applied by the time this runs, and a
      // failed notification shouldn't unwind it or fail the request that
      // triggered it (that request's own recording already succeeded).
      this.logger.error(`Failed to send audit-hold-started email for user=${userId}: ${(err as Error).message}`);
    }
  }

  private async getTrainer(userId: string) {
    const trainer = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { dialect: true, dialectVariant: true },
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
      include: {
        word: true,
        prompt: { include: { words: { orderBy: { position: 'asc' } } } },
        session: { include: { user: { include: { dialect: true, dialectVariant: true } } } },
      },
    });
    if (!assignment) throw new NotFoundException('Word assignment not found');
    if (assignment.session.userId !== userId) throw new ForbiddenException('Word assignment does not belong to you');
    return assignment;
  }

  /**
   * Spreads ENGLISH_TO_DIALECT assignments across the whole word bank
   * instead of pure `random()` sampling, which -- given a large bank and a
   * trainer doing many short sessions -- lets a small subset of words get
   * picked repeatedly by chance while others are never touched. Prefers
   * words this trainer has never recorded yet; only once the trainer has
   * attempted every word does the pool widen back to the full bank (a
   * word can still be re-assigned across sessions by design, just not
   * before every other word has had a turn).
   */
  private async pickEnglishToDialectWord(userId: string, totalWords: number) {
    const attempted = await this.prisma.wordRecording.findMany({
      where: { userId, direction: 'ENGLISH_TO_DIALECT', wordId: { not: null } },
      select: { wordId: true },
      distinct: ['wordId'],
    });
    const attemptedIds = attempted.flatMap(({ wordId }) => (wordId ? [wordId] : []));

    const unattemptedCount = await this.prisma.word.count({ where: { id: { notIn: attemptedIds } } });
    const where = unattemptedCount > 0 ? { id: { notIn: attemptedIds } } : {};
    const count = unattemptedCount > 0 ? unattemptedCount : totalWords;

    const [word] = await this.prisma.word.findMany({ where, take: 1, skip: Math.floor(Math.random() * count) });
    return word;
  }

  private async pickSentenceRebuildSource(dialectTag: string): Promise<{ promptId: string; fragments: string[] } | null> {
    const where = { dialectTag, active: true, words: { some: { dialectTag } } };
    const promptIds = await this.prisma.prompt.findMany({ where, select: { id: true } });
    const eligible: string[] = [];
    for (const { id } of promptIds) {
      const wordCount = await this.prisma.promptWord.count({ where: { promptId: id, dialectTag } });
      if (wordCount >= 2) eligible.push(id);
    }
    if (eligible.length === 0) return null;

    const promptId = eligible[Math.floor(Math.random() * eligible.length)];
    const words = await this.prisma.promptWord.findMany({
      where: { promptId, dialectTag },
      orderBy: { position: 'asc' },
      select: { text: true },
    });
    return { promptId, fragments: words.map((w) => w.text) };
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

/** Fisher-Yates shuffle -- used to present SENTENCE_REBUILD fragments in random order (never the correct order). */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
