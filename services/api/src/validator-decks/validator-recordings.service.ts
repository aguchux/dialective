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

  async listAll(query: ListValidatorRecordingsDto) {
    const skip = (query.page - 1) * query.pageSize;
    const orderBy = { [query.sortBy]: query.sortDir };
    const where = this.buildWhere(query);

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

    const items = await Promise.all(rows.map((row) => this.toSummary(row)));
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private buildWhere(query: ListValidatorRecordingsDto) {
    const scoreRange = this.buildScoreRange(query);
    return {
      ...(query.dialectTag ? { dialectTag: query.dialectTag } : {}),
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
      rawScore: recording.rawScore?.toString() ?? null,
      score: recording.score?.toString() ?? null,
      compositeScore: recording.compositeScore?.toString() ?? null,
      audioUrl:
        recording.audioBucket && recording.audioKey
          ? (await this.storage.createPresignedDownloadUrl(recording.audioBucket, recording.audioKey)).url
          : null,
      createdAt: recording.createdAt,
    };
  }
}
