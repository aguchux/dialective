import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
import { SmsService } from '../sms/sms.service';
import { AUDIT_HOLD_MESSAGE, isOnAuditHold } from '../common/audit-hold.util';
import { CHECKLIST_VERSION, QRAC_CHECKLIST, nextQracVersion } from './qrac.util';
import { CreateWordRecordingDto } from './dto/create-word-recording.dto';
import { CreateWordRecordingUploadUrlDto } from './dto/create-word-recording-upload-url.dto';
import { GetSpellingSuggestionsDto } from './dto/get-spelling-suggestions.dto';
import { ListSubmissionsDto } from './dto/list-submissions.dto';

const RECORDINGS_BUCKET = process.env.SPACES_WORD_RECORDINGS_BUCKET ?? 'dialectiva-word-recordings';
const TERMS_VERSION = 'voice-training-v1';
/** A word abandoned (never recorded) this many times by the same trainer is excluded from their future picks -- see recordSkipIfAbandoned/pickEnglishToDialectWord. */
const WORD_SKIP_BAN_THRESHOLD = 2;

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
    @Optional() private readonly sms?: SmsService,
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
      await this.prisma.trainingSession.update({
        where: { id: session.id },
        data: { endedAt: new Date() },
      });
    }
    return { ended: true };
  }

  async signQrac(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (session.endedAt) throw new ConflictException('This training session has ended');

    const latest = await this.prisma.qracAffirmationSubmission.findFirst({
      where: { userId },
      orderBy: { signedAt: 'desc' },
      select: { version: true },
    });
    const version = nextQracVersion(latest?.version ?? null);
    const signedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.qracAffirmationSubmission.create({
        data: { userId, sessionId, version, checklistVersion: CHECKLIST_VERSION, signedAt },
      }),
      this.prisma.trainingSession.update({
        where: { id: sessionId },
        data: { lastQracAt: signedAt },
      }),
    ]);

    return { version, signedAt };
  }

  async nextAssignment(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    if (session.endedAt) throw new ConflictException('This training session has ended');

    await this.assertNotOnAuditHold(userId);
    await this.recordSkipIfAbandoned(userId, sessionId);

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

    // QRAC can be configured either as a mandatory check-in for every new
    // session, or as the existing periodic re-affirmation. Both gates live
    // at the assignment chokepoint so a trainer cannot receive work before
    // signing, and an admin setting change takes effect immediately.
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
          qracChecklist: QRAC_CHECKLIST,
        });
      }
    }

    const trainer = await this.getTrainer(userId);

    const [taskTokenCost, wallet] = await Promise.all([
      this.settings.getTaskTokenCost(),
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

    // Live-evaluated every call, never cached/session-fixed -- same posture
    // as the audit-hold/QRAC/required-courses checks above. Three
    // independent admin content-source gates -- word/sentence training
    // restrict which ENGLISH_TO_DIALECT source types nextAssignment may
    // hand out; reverseWordTrainingEnabled gates
    // DIALECT_TO_ENGLISH separately. All three CAN be turned off at once
    // (PlatformSettingsService.update no longer blocks that combination) --
    // that is the trainer sees NO_WORDS_AVAILABLE, same as any other
    // exhausted-pool case, since there is genuinely nothing left to serve.
    const [wordTrainingEnabled, sentenceTrainingEnabled, reverseEnabled] = await Promise.all([
      this.settings.isWordTrainingEnabled(),
      this.settings.isSentenceTrainingEnabled(),
      this.settings.isReverseWordTrainingEnabled(),
    ]);

    // Both ENGLISH_TO_DIALECT content gates off means there is nothing else
    // to serve -- reverse-validation becomes the ALWAYS-served source
    // (skipping the normal 1/3 roll below) rather than sometimes still
    // 404ing with NO_WORDS_AVAILABLE. Falls through to the empty-pool
    // NO_WORDS_AVAILABLE case (unchanged) only when reverseEnabled is also
    // off, or the reverse-source pool itself is empty.
    const contentGatesBothOff = !wordTrainingEnabled && !sentenceTrainingEnabled;
    const roll = Math.random();
    const reverseSource =
      reverseEnabled && (contentGatesBothOff || roll < 1 / 3)
        ? await this.pickReverseSource(userId, sessionId, trainer.dialect!.tag)
        : null;

    if (reverseSource) {
      const assignment = await this.prisma.wordTrainingAssignment.create({
        data: {
          sessionId,
          wordId: reverseSource.wordId,
          sentenceId: reverseSource.sentenceId,
          direction: 'DIALECT_TO_ENGLISH',
          sourceRecordingId: reverseSource.id,
        },
      });
      const sourceAudioUrl =
        reverseSource.audioBucket && reverseSource.audioKey
          ? (
              await this.storage.createPresignedDownloadUrl(
                reverseSource.audioBucket,
                reverseSource.audioKey,
              )
            ).url
          : null;
      return {
        assignmentId: assignment.id,
        wordId: reverseSource.wordId,
        direction: assignment.direction,
        promptText: reverseSource.translationText,
        sourceAudioUrl,
        sourceLanguage: trainer.dialect!.name,
        responseLanguage: 'English',
        dialectTag: trainer.dialect!.tag,
        dialectKeyboardLayout: trainer.dialect!.keyboardLayout,
        phraseTierJustReached: false,
      };
    }

    // Sentences are a first-class source now, not a phrase-escalation tier.
    // When both sources are enabled, keep a balanced mix; when words are off,
    // sentences are the only forward source.
    if (sentenceTrainingEnabled && (!wordTrainingEnabled || roll < 1 / 2)) {
      const sentenceSource = await this.pickSentenceSource(userId);
      if (sentenceSource) {
        const assignment = await this.prisma.wordTrainingAssignment.create({
          data: { sessionId, sentenceId: sentenceSource.sentenceId, direction: 'ENGLISH_TO_DIALECT' },
        });
        return {
          assignmentId: assignment.id,
          wordId: null as string | null,
          direction: assignment.direction,
          promptText: sentenceSource.sentenceText,
          sourceLanguage: 'English',
          responseLanguage: trainer.dialect!.name,
          dialectTag: trainer.dialect!.tag,
          dialectKeyboardLayout: trainer.dialect!.keyboardLayout,
          phraseTierJustReached: false,
        };
      }
      // Pool empty for this tier -- fall through below.
    }

    // wordTrainingEnabled=false means single words are never offered --
    // when sentenceTrainingEnabled is also on, serve any Sentence
    // regardless of tier (a trainer who hasn't escalated yet, or whose
    // tier's pool was empty above, still needs SOME content); when both
    // gates somehow end up unusable (empty sentence pool + word training
    // off), fall through to NO_WORDS_AVAILABLE below like any other
    // exhausted-pool case.
    if (!wordTrainingEnabled) {
      if (sentenceTrainingEnabled) {
        const anySentence = await this.pickSentenceSource(userId);
        if (anySentence) {
          const assignment = await this.prisma.wordTrainingAssignment.create({
            data: { sessionId, sentenceId: anySentence.sentenceId, direction: 'ENGLISH_TO_DIALECT' },
          });
          return {
            assignmentId: assignment.id,
            wordId: null as string | null,
            direction: assignment.direction,
            promptText: anySentence.sentenceText,
            sourceLanguage: 'English',
            responseLanguage: trainer.dialect!.name,
            dialectTag: trainer.dialect!.tag,
            dialectKeyboardLayout: trainer.dialect!.keyboardLayout,
            phraseTierJustReached: false,
          };
        }
      }
      throw new NotFoundException('NO_WORDS_AVAILABLE');
    }

    const totalWords = await this.prisma.word.count();
    if (totalWords === 0) {
      // Distinct, stable message the frontend matches on to show a "check
      // back later" empty state instead of a generic error banner -- see
      // WordTrainingDialog.tsx.
      throw new NotFoundException('NO_WORDS_AVAILABLE');
    }
    const word = await this.pickEnglishToDialectWord(userId);
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
      phraseTierJustReached: false,
    };
  }

  /**
   * A trainer calling nextAssignment while their own most recent
   * ENGLISH_TO_DIALECT assignment in this session is still unconsumed means
   * they clicked "Skip / next" (or otherwise abandoned it) rather than
   * submitting a recording -- createRecording/consumeAssignment is the only
   * other place consumedAt gets set. Bumps that word's skip count and, once
   * it crosses WORD_SKIP_BAN_THRESHOLD, the word stops appearing in this
   * trainer's future picks (see pickEnglishToDialectWord's excludedWordIds).
   * Reverse-validation (DIALECT_TO_ENGLISH) assignments self-score
   * immediately and are never left unconsumed, so this only ever fires for
   * the ENGLISH_TO_DIALECT live-record flow the feature targets.
   */
  private async recordSkipIfAbandoned(userId: string, sessionId: string): Promise<void> {
    const lastAssignment = await this.prisma.wordTrainingAssignment.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !lastAssignment ||
      lastAssignment.consumedAt ||
      lastAssignment.direction !== 'ENGLISH_TO_DIALECT' ||
      !lastAssignment.wordId
    ) {
      return;
    }

    await this.prisma.wordSkip.upsert({
      where: { userId_wordId: { userId, wordId: lastAssignment.wordId } },
      create: { userId, wordId: lastAssignment.wordId, skipCount: 1 },
      update: { skipCount: { increment: 1 } },
    });
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
   * known English word/sentence is the ground truth) -- one reverse-
   * validation is enough since it's a binary exact-match check, not an
   * agreement-ratio computation. It also inserts a SECOND, new
   * ENGLISH_TO_DIALECT recording (PENDING) from the SAME audio the trainer
   * just submitted: the trainer's own fresh dialect pronunciation of the
   * source item, which becomes new peer-servable content in its own right
   * (see insertRedoRecording) -- this is what keeps the dialect pool growing
   * recording-by-recording, each attempt both validating the recording
   * before it and producing a fresh one to be validated later.
   *
   * ENGLISH_TO_DIALECT has no ground truth of its own -- it stays
   * PENDING/unscored until a peer's reverse-validation recording lands (see
   * scoreReverseValidatedSource).
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
    // A Sentence-sourced assignment carries its source text via
    // assignment.sentence (wordId is null). A DIALECT_TO_ENGLISH
    // reverse-validation assignment whose SOURCE was itself a sentence also
    // has wordId null and sentenceId set (see pickReverseSource/
    // nextAssignment's reverseSource branch) -- both cases read from
    // assignment.sentence.text.
    const isSentenceSourced = !assignment.wordId;
    const promptText = assignment.wordId ? assignment.word?.text : assignment.sentence?.text;
    if (!promptText) {
      throw new UnprocessableEntityException('This assignment has no associated word or sentence');
    }

    // Typing a transcript is only required for a Word-sourced assignment --
    // for a Sentence prompt (either direction) the recording alone is the
    // artifact collected; requiring a full-sentence transcript on top of it
    // would duplicate the reading/listening exercise without adding
    // scoring value the recording doesn't already carry. This also means
    // DIALECT_TO_ENGLISH's validationScore (typed-answer vs. expected-text
    // match) can't run for a sentence source -- see below.
    if (
      (isSentenceSourced ? false : !body.responseText) ||
      !body.audioKey ||
      !body.bucket ||
      body.durationMs === undefined ||
      !body.noiseRating
    ) {
      throw new UnprocessableEntityException(
        isSentenceSourced
          ? 'bucket, audioKey, durationMs, and noiseRating are required for this assignment'
          : 'responseText, bucket, audioKey, durationMs, and noiseRating are required for this assignment',
      );
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
    const wordCount = Math.max(1, promptText.trim().split(/\s+/).length);
    const allowedMs = Math.min(perWordSeconds * wordCount, maxSeconds) * 1000;
    const durationGraceMs = 5_000;
    if (body.durationMs > allowedMs + durationGraceMs) {
      throw new UnprocessableEntityException(
        `Recording exceeds the ${Math.round(allowedMs / 1000)}s limit for this word`,
      );
    }

    // A sentence source has no typed transcript to compare (see the
    // isSentenceSourced check above), so DIALECT_TO_ENGLISH's exact-match
    // self-score can't run for it -- validationScore stays null, same as
    // ENGLISH_TO_DIALECT's status quo, and the recording is scored by the
    // normal ASR/quality-gate/peer-review path instead.
    const validationScore =
      assignment.direction === 'DIALECT_TO_ENGLISH' && body.responseText
        ? normalizeAnswer(body.responseText) === normalizeAnswer(promptText)
          ? 1
          : 0
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

      // updateMany's WHERE makes this safe under concurrent requests. Moves
      // taskTokenCost from spendable balance into lockedBalance rather than
      // debiting outright; released back to balance on a stuck-timeout
      // refund or replaced by the no-loss payout once SCORED. One lock
      // covers the whole attempt even for DIALECT_TO_ENGLISH, which also
      // inserts a second redo recording below -- presented to the trainer
      // as a single exercise, not two separate charges.
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

      const created = await tx.wordRecording.create({
        data: {
          wordId: assignment.wordId,
          sentenceId: assignment.wordId ? null : assignment.sentenceId,
          userId,
          sessionId: assignment.sessionId,
          assignmentId: assignment.id,
          direction: assignment.direction,
          dialectTag: assignment.session.user.dialect!.tag,
          dialectVariantId: assignment.session.user.dialectVariantId,
          // translationText is a required column; a sentence-sourced
          // assignment with no typed transcript falls back to the prompt's
          // own known-correct text (the sentence being read/spoken) rather
          // than an empty/synthetic value.
          translationText: body.responseText?.trim() || promptText,
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
      await this.scoreReverseValidatedSource(assignment.sourceRecordingId, validationScore);
      await this.insertRedoRecording(userId, assignment, body);
    }

    if (assignment.direction === 'ENGLISH_TO_DIALECT' && assignment.word) {
      await this.normalizeSpellingBestEffort(
        recording.id,
        assignment.word.text,
        assignment.session.user.dialect!.name,
        body.responseText!.trim(),
      );
    }

    // An unsupported dialect here is NOT a rejection -- ASR is an optional
    // annotation for word recordings, never a gate on recording creation.
    // asr_stream is simply omitted when the dialect has no registered
    // engine; quality-gate-worker's existing asr_stream-forwarding branch
    // (see quality-gate-worker/worker.py) only fires when the field is
    // present.
    const asrRoute = this.asrRegistry.resolve(assignment.session.user.dialect!.tag);
    await this.streams.publish('quality-gate-jobs', {
      record_kind: 'word_recording',
      word_recording_id: recording.id,
      bucket: body.bucket,
      audio_key: body.audioKey,
      dialect_tag: assignment.session.user.dialect!.tag,
      expected_text: body.responseText?.trim() || promptText,
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
   * A trainer's own word-training recordings. translationText stands in
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
        include: { word: { select: { text: true } }, sentence: { select: { text: true } } },
      }),
      this.prisma.wordRecording.count({ where }),
    ]);

    return {
      items: await Promise.all(
        items.map(async (recording) => ({
          id: recording.id,
          promptText:
            recording.direction === 'ENGLISH_TO_DIALECT'
              ? (recording.word?.text ?? recording.sentence?.text ?? recording.translationText)
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
              ? (
                  await this.storage.createPresignedDownloadUrl(
                    recording.audioBucket,
                    recording.audioKey,
                  )
                ).url
              : null,
          rejectionReason: null as string | null,
          createdAt: recording.createdAt,
          scoredAt: recording.scoredAt,
          settledAt: recording.settledAt,
        })),
      ),
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
  private async normalizeSpellingBestEffort(
    recordingId: string,
    englishWord: string,
    dialectName: string,
    typedText: string,
  ) {
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

    const suggestions: { text: string; source: 'community' | 'ai' }[] = communityRows.map(
      (row) => ({
        text: row.translationText,
        source: 'community' as const,
      }),
    );

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
  private async scoreReverseValidatedSource(
    sourceRecordingId: string,
    reverseValidationScore: number | null,
  ) {
    // null means the reverse-validation attempt had no transcript to compare
    // (a sentence-sourced DIALECT_TO_ENGLISH assignment) -- inconclusive,
    // same as a miss: the source is left PENDING rather than scored.
    if (reverseValidationScore === null || reverseValidationScore < 1) return;
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
   * Fires after every successful WordRecording creation. Auto-puts the
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
      select: { email: true, phoneNumber: true, phoneVerifiedAt: true, smsNotificationsEnabled: true },
    });

    try {
      await this.mail.sendAuditHoldStartedEmail({
        trainerEmail: user.email,
        submissionCount: count,
      });
    } catch (err) {
      // Best-effort, same as every other post-action email in this codebase
      // -- the hold has already been applied by the time this runs, and a
      // failed notification shouldn't unwind it or fail the request that
      // triggered it (that request's own recording already succeeded).
      this.logger.error(
        `Failed to send audit-hold-started email for user=${userId}: ${(err as Error).message}`,
      );
    }

    if (this.sms && user.phoneNumber && user.phoneVerifiedAt && user.smsNotificationsEnabled) {
      try {
        await this.sms.sendTransactional(
          user.phoneNumber,
          `Dialect Library: your account is on hold for a routine review after ${count} submissions. Training is paused until review is complete.`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send audit-hold-started SMS for user=${userId}: ${(err as Error).message}`,
        );
      }
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
    )
      throw new UnprocessableEntityException('Complete dialect onboarding before training');
    return trainer;
  }

  private async getOwnedSession(userId: string, sessionId: string) {
    const session = await this.prisma.trainingSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Training session not found');
    if (session.userId !== userId)
      throw new ForbiddenException('Training session does not belong to you');
    return session;
  }

  private async getOwnedAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.wordTrainingAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        word: true,
        sentence: true,
        session: { include: { user: { include: { dialect: true, dialectVariant: true } } } },
      },
    });
    if (!assignment) throw new NotFoundException('Word assignment not found');
    if (assignment.session.userId !== userId)
      throw new ForbiddenException('Word assignment does not belong to you');
    return assignment;
  }

  /**
   * Spreads ENGLISH_TO_DIALECT assignments across the whole word bank
   * instead of pure `random()` sampling, which -- given a large bank and a
   * trainer doing many short sessions -- lets a small subset of words get
   * picked repeatedly by chance while others are never touched. Prefers
   * words this trainer has never recorded. Once every enabled word has been
   * attempted at least once, the pool CYCLES rather than permanently
   * exhausting: pickFromCycle re-covers the full enabled bank at random,
   * excluding only this trainer's single most-recently-assigned word so the
   * same word can never repeat back-to-back. A trainer must never have
   * nothing left to record (see NO_WORDS_AVAILABLE in nextAssignment,
   * reserved for a genuinely empty/all-disabled bank).
   */
  private async pickEnglishToDialectWord(userId: string) {
    const [attempted, banned] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where: { userId, direction: 'ENGLISH_TO_DIALECT', wordId: { not: null } },
        select: { wordId: true },
        distinct: ['wordId'],
      }),
      this.prisma.wordSkip.findMany({
        where: { userId, skipCount: { gte: WORD_SKIP_BAN_THRESHOLD } },
        select: { wordId: true },
      }),
    ]);
    const attemptedIds = attempted.flatMap(({ wordId }) => (wordId ? [wordId] : []));
    // Banned words never come back into rotation for this trainer, even once
    // the "prefer unattempted" pool below widens back to the full bank.
    const bannedIds = banned.map(({ wordId }) => wordId);
    const excludedIds = [...new Set([...attemptedIds, ...bannedIds])];

    const unattemptedCount = await this.prisma.word.count({
      where: { id: { notIn: excludedIds }, isDisabled: false },
    });
    if (unattemptedCount > 0) {
      const [word] = await this.prisma.word.findMany({
        where: { id: { notIn: excludedIds }, isDisabled: false },
        take: 1,
        skip: Math.floor(Math.random() * unattemptedCount),
      });
      return word;
    }

    // Every enabled word has been attempted (or banned) -- cycle instead of
    // exhausting. Banned words stay excluded even during a cycle; only the
    // single most-recently-assigned word is excluded otherwise, so a fresh
    // cycle can start immediately after finishing the last one.
    const lastAssigned = await this.prisma.wordTrainingAssignment.findFirst({
      where: { session: { userId }, wordId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { wordId: true },
    });
    const cycleExcludedIds = [...new Set([...bannedIds, ...(lastAssigned?.wordId ? [lastAssigned.wordId] : [])])];
    const cycleWhere = { id: { notIn: cycleExcludedIds }, isDisabled: false };
    const cycleCount = await this.prisma.word.count({ where: cycleWhere });
    if (cycleCount <= 0) return null;
    const [word] = await this.prisma.word.findMany({
      where: cycleWhere,
      take: 1,
      skip: Math.floor(Math.random() * cycleCount),
    });
    return word;
  }

  /**
   * Reads a Sentence's own `text` directly -- Sentences are a first-class
   * ENGLISH_TO_DIALECT source (see nextAssignment), not gated by a trainer's
   * lifetime word count. Source text is always English -- the trainer
   * records their own dialect from their own fluency, matching
   * ENGLISH_TO_DIALECT's pattern (see the response's sourceLanguage:
   * 'English' in nextAssignment).
   *
   * Same cycling posture as pickEnglishToDialectWord: prefers Sentences this
   * trainer has never attempted yet; once every enabled sentence has been
   * attempted, cycles back over the full enabled bank at random, excluding
   * only this trainer's single most-recently-assigned sentence so the same
   * one never repeats back-to-back.
   */
  private async pickSentenceSource(
    userId: string,
  ): Promise<{ sentenceId: string; sentenceText: string } | null> {
    const attempted = await this.prisma.wordRecording.findMany({
      where: { userId, direction: 'ENGLISH_TO_DIALECT', sentenceId: { not: null } },
      select: { sentenceId: true },
      distinct: ['sentenceId'],
    });
    const attemptedIds = attempted.flatMap(({ sentenceId }) => (sentenceId ? [sentenceId] : []));

    const unattemptedCount = await this.prisma.sentence.count({
      where: { id: { notIn: attemptedIds }, isDisabled: false },
    });
    if (unattemptedCount > 0) {
      const [sentence] = await this.prisma.sentence.findMany({
        where: { id: { notIn: attemptedIds }, isDisabled: false },
        take: 1,
        skip: Math.floor(Math.random() * unattemptedCount),
      });
      return sentence ? { sentenceId: sentence.id, sentenceText: sentence.text } : null;
    }

    // Every enabled sentence has been attempted -- cycle instead of
    // exhausting, same rationale as pickEnglishToDialectWord's cycle branch.
    const lastAssigned = await this.prisma.wordTrainingAssignment.findFirst({
      where: { session: { userId }, sentenceId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { sentenceId: true },
    });
    const cycleWhere = {
      id: { notIn: lastAssigned?.sentenceId ? [lastAssigned.sentenceId] : [] },
      isDisabled: false,
    };
    const cycleCount = await this.prisma.sentence.count({ where: cycleWhere });
    if (cycleCount <= 0) return null;
    const [sentence] = await this.prisma.sentence.findMany({
      where: cycleWhere,
      take: 1,
      skip: Math.floor(Math.random() * cycleCount),
    });
    return sentence ? { sentenceId: sentence.id, sentenceText: sentence.text } : null;
  }

  private async pickReverseSource(userId: string, sessionId: string, dialectTag: string) {
    const [usedSources, attemptedSources] = await Promise.all([
      this.prisma.wordTrainingAssignment.findMany({
        where: { sessionId, sourceRecordingId: { not: null } },
        select: { sourceRecordingId: true },
      }),
      this.prisma.wordRecording.findMany({
        where: { userId, OR: [{ wordId: { not: null } }, { sentenceId: { not: null } }] },
        select: { wordId: true, sentenceId: true },
      }),
    ]);
    const attemptedWordIds = attemptedSources.flatMap(({ wordId }) => (wordId ? [wordId] : []));
    const attemptedSentenceIds = attemptedSources.flatMap(({ sentenceId }) =>
      sentenceId ? [sentenceId] : [],
    );
    const where = {
      id: {
        notIn: usedSources.flatMap(({ sourceRecordingId }) =>
          sourceRecordingId ? [sourceRecordingId] : [],
        ),
      },
      dialectTag,
      // Only one forward direction remains -- Word- vs Sentence-sourced
      // recordings are distinguished by which FK is set, not by direction.
      direction: 'ENGLISH_TO_DIALECT' as const,
      userId: { not: userId },
      noiseRating: { not: 'NOISY' as const },
      OR: [
        { wordId: { not: null, notIn: attemptedWordIds } },
        { sentenceId: { not: null, notIn: attemptedSentenceIds } },
      ],
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

  /**
   * Inserts the trainer's fresh dialect audio (recorded during a
   * DIALECT_TO_ENGLISH attempt, alongside their typed English translation)
   * as a brand-new, standalone ENGLISH_TO_DIALECT recording -- PENDING,
   * eligible to later be served to a third trainer via pickReverseSource
   * just like any other dialect recording. translationText defaults to the
   * source recording's own spelling (the redo is a fresh AUDIO take of an
   * already-known-good spelling, not a fresh spelling attempt -- no
   * separate typing step exists for it). redoOfRecordingId is purely an
   * audit trail back to the recording this attempt validated-and-replaced;
   * it never affects scoring.
   */
  private async insertRedoRecording(
    userId: string,
    assignment: NonNullable<Awaited<ReturnType<WordsService['getOwnedAssignment']>>>,
    body: CreateWordRecordingDto,
  ): Promise<void> {
    const source = await this.prisma.wordRecording.findUnique({
      where: { id: assignment.sourceRecordingId! },
      select: { translationText: true },
    });
    if (!source) return;

    const redo = await this.prisma.wordRecording.create({
      data: {
        wordId: assignment.wordId,
        sentenceId: assignment.wordId ? null : assignment.sentenceId,
        userId,
        sessionId: assignment.sessionId,
        direction: 'ENGLISH_TO_DIALECT',
        dialectTag: assignment.session.user.dialect!.tag,
        dialectVariantId: assignment.session.user.dialectVariantId,
        translationText: source.translationText,
        audioBucket: body.bucket,
        audioKey: body.audioKey,
        durationMs: body.durationMs,
        noiseRating: body.noiseRating,
        redoOfRecordingId: assignment.sourceRecordingId,
        status: 'PENDING',
      },
    });

    const asrRoute = this.asrRegistry.resolve(assignment.session.user.dialect!.tag);
    await this.streams.publish('quality-gate-jobs', {
      record_kind: 'word_recording',
      word_recording_id: redo.id,
      bucket: body.bucket!,
      audio_key: body.audioKey!,
      dialect_tag: assignment.session.user.dialect!.tag,
      expected_text: source.translationText,
      ...(asrRoute ? { asr_stream: asrRoute.stream } : {}),
    });
  }
}

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9\s'-]/g, '')
    .replace(/\s+/g, ' ');
}
