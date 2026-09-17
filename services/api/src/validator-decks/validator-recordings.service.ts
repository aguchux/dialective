import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ListValidatorRecordingsDto } from './dto/list-validator-recordings.dto';

/**
 * Pool browsing for validators -- mirrors AdminRecordingsService.listAll's
 * filter/pagination shape (see admin-recordings.service.ts), but the
 * returned summary deliberately omits the `trainer` block (name/email):
 * validators don't need trainer identity to score a recording, so it's
 * never included in this read surface.
 */
@Injectable()
export class ValidatorRecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listAll(query: ListValidatorRecordingsDto, callerUserId: string, callerRole: string) {
    const skip = (query.page - 1) * query.pageSize;
    const orderBy = { [query.sortBy]: query.sortDir };

    // Admins see every dialect; a validator only sees recordings for
    // dialect(s) they've been onboarded to (ValidatorDialectAssignment,
    // admin-managed -- see docs/validators.md). A validator with zero
    // assignments gets an empty page, never an error or the full pool.
    let assignedDialectTags: string[] | null = null;
    if (callerRole !== 'ADMIN') {
      const assignments = await this.prisma.validatorDialectAssignment.findMany({
        where: { userId: callerUserId },
        select: { dialect: { select: { tag: true } } },
      });
      assignedDialectTags = assignments.map((a) => a.dialect.tag);
      if (assignedDialectTags.length === 0) {
        return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 1 };
      }
    }

    const where = this.buildWhere(query, assignedDialectTags);

    const [rows, total] = await Promise.all([
      this.prisma.wordRecording.findMany({
        where,
        orderBy,
        skip,
        take: query.pageSize,
        include: { word: { select: { text: true } }, sentence: { select: { text: true } } },
      }),
      this.prisma.wordRecording.count({ where }),
    ]);

    // Deck membership is looked up per page, not per row -- one query for
    // the whole page's recordingIds against the caller's OWN decks only
    // (a recording can sit in many validators' decks; the UI only needs to
    // know whether ITS caller can transcribe/flag/score it, which requires
    // it being in one of their own). Lets Transcribe/Flag work correctly
    // for a recording added to a deck in an earlier session, not just this
    // one -- see TaskMode.tsx's recordingDeckIds doc comment.
    const recordingIds = rows.map((row) => row.id);
    const ownedItems =
      recordingIds.length > 0
        ? await this.prisma.validatorDeckItem.findMany({
            where: { recordingId: { in: recordingIds }, deck: { ownerUserId: callerUserId } },
            select: { recordingId: true, deckId: true },
            orderBy: { addedAt: 'desc' },
          })
        : [];
    // orderBy addedAt desc + first-write-wins Map population means a
    // recording added to more than one of the caller's decks reports the
    // most recently-added one -- an arbitrary but stable choice, since the
    // UI only needs ONE deckId to route Transcribe/Flag/score writes to.
    const deckIdByRecordingId = new Map<string, string>();
    for (const item of ownedItems) {
      if (!deckIdByRecordingId.has(item.recordingId)) {
        deckIdByRecordingId.set(item.recordingId, item.deckId);
      }
    }

    const items = await Promise.all(
      rows.map((row) => this.toSummary(row, deckIdByRecordingId.get(row.id) ?? null)),
    );
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private buildWhere(query: ListValidatorRecordingsDto, assignedDialectTags: string[] | null) {
    const scoreRange = this.buildScoreRange(query);
    // A client-supplied dialectTag narrows further within the caller's own
    // assigned dialects -- it can never widen past them. Admins (null here)
    // are unrestricted and use the plain exact-match filter as before.
    const dialectFilter =
      assignedDialectTags === null
        ? query.dialectTag
          ? { dialectTag: query.dialectTag }
          : {}
        : query.dialectTag
          ? {
              dialectTag: assignedDialectTags.includes(query.dialectTag)
                ? query.dialectTag
                : '__none__',
            }
          : { dialectTag: { in: assignedDialectTags } };
    return {
      ...dialectFilter,
      ...(query.status ? { status: query.status } : {}),
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

  private buildScoreRange(query: ListValidatorRecordingsDto) {
    if (query.minScore === undefined && query.maxScore === undefined) return undefined;
    const range: { gte?: number; lte?: number } = {};
    if (query.minScore !== undefined) range.gte = query.minScore;
    if (query.maxScore !== undefined) range.lte = query.maxScore;
    return range;
  }

  private async toSummary(
    recording: Awaited<
      ReturnType<ValidatorRecordingsService['prisma']['wordRecording']['findMany']>
    >[number] & {
      word: { text: string } | null;
      sentence: { text: string } | null;
    },
    myDeckId: string | null,
  ) {
    return {
      id: recording.id,
      direction: recording.direction,
      promptText:
        recording.direction === 'ENGLISH_TO_DIALECT'
          ? (recording.word?.text ?? recording.sentence?.text ?? recording.translationText)
          : `Translate: ${recording.translationText}`,
      responseText: recording.translationText,
      asrTranscript: recording.transcript,
      dialectTag: recording.dialectTag,
      status: recording.status,
      myDeckId,
      rawScore: recording.rawScore?.toString() ?? null,
      score: recording.score?.toString() ?? null,
      compositeScore: recording.compositeScore?.toString() ?? null,
      audioUrl:
        recording.audioBucket && recording.audioKey
          ? (
              await this.storage.createPresignedDownloadUrl(
                recording.audioBucket,
                recording.audioKey,
              )
            ).url
          : null,
      createdAt: recording.createdAt,
    };
  }
}
