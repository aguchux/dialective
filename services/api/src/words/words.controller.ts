import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateWordRecordingUploadUrlDto } from './dto/create-word-recording-upload-url.dto';
import { CreateWordRecordingDto } from './dto/create-word-recording.dto';

const RECORDINGS_BUCKET = process.env.SPACES_WORD_RECORDINGS_BUCKET ?? 'dialectiva-word-recordings';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

/**
 * Word-library flow: one English word at a time -> trainer types the
 * translation in their chosen dialect -> records themselves saying it ->
 * both get stored as a WordRecording row. Deliberately does NOT go through
 * the asr-jobs-vosk/asr-jobs-whisper pipeline the sentence-prompt flow uses
 * (no transcription/validation of the recording) -- this is a direct
 * word/voice capture, not an ASR test. See AGENTS.md "Word library".
 */
@Controller('words')
export class WordsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('random')
  async getRandom() {
    const count = await this.prisma.word.count();
    if (count === 0) {
      throw new NotFoundException('No words available');
    }
    const [word] = await this.prisma.word.findMany({
      take: 1,
      skip: Math.floor(Math.random() * count),
    });
    return { wordId: word.id, text: word.text };
  }

  @Post('recordings/upload-url')
  async createUploadUrl(@Body() body: CreateWordRecordingUploadUrlDto) {
    const recordingId = randomUUID();
    const extension = EXTENSION_BY_CONTENT_TYPE[body.contentType];
    const key = `${body.dialectTag}/${body.wordId}/${recordingId}.${extension}`;

    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      RECORDINGS_BUCKET,
      key,
      body.contentType,
    );

    return { recordingId, uploadUrl: url, key, bucket: RECORDINGS_BUCKET, expiresInSeconds };
  }

  /**
   * Persists the word/translation/audio triple once the trainer's client has
   * finished PUTting audio to the presigned URL from `recordings/upload-url`.
   * No queueing, no ASR -- straight to Postgres.
   */
  @Post('recordings')
  async createRecording(@Body() body: CreateWordRecordingDto) {
    const recording = await this.prisma.wordRecording.create({
      data: {
        wordId: body.wordId,
        dialectTag: body.dialectTag,
        translationText: body.translationText,
        audioBucket: body.bucket,
        audioKey: body.audioKey,
      },
    });
    return { recordingId: recording.id, status: 'saved' };
  }
}
