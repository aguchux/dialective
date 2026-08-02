import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { RedisStreamsService } from '../redis-streams/redis-streams.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';

const SUBMISSIONS_BUCKET = process.env.SPACES_SUBMISSIONS_BUCKET ?? 'dialectiva-submissions';
const ASR_STREAM = process.env.ASR_STREAM ?? 'asr-jobs';

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
  ) {}

  /**
   * Issues a presigned Spaces upload URL for a new submission. The trainer's
   * client PUTs audio bytes directly to `url`; audio never transits `api`.
   * Caller then POSTs the returned `submissionId`/`key` to `create` to
   * enqueue the asr-jobs message.
   */
  @Post('upload-url')
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
   * Enqueues the asr-jobs message once the trainer's client has finished
   * PUTting audio to the presigned URL from `upload-url`. vosk-worker picks
   * this up, transcribes, and writes the result to the `result:<id>` Redis
   * key that `result` below reads back -- a test-only scratch store standing
   * in for the not-yet-built Postgres submissions table (Project Plan step 2).
   */
  @Post('create')
  async create(@Body() body: CreateSubmissionDto) {
    await this.streams.publish(ASR_STREAM, {
      submission_id: body.submissionId,
      prompt_id: body.promptId,
      dialect_tag: body.dialectTag,
      bucket: body.bucket,
      audio_key: body.audioKey,
    });

    return { submissionId: body.submissionId, status: 'queued' };
  }

  /**
   * Reads the test-only result scratch key vosk-worker writes after
   * transcribing. Returns 404 while the job is still in flight -- callers
   * poll this until it resolves.
   */
  @Get(':submissionId/result')
  async getResult(@Param('submissionId') submissionId: string) {
    const raw = await this.streams.get(`result:${submissionId}`);
    if (!raw) {
      throw new NotFoundException('Result not ready yet');
    }
    return JSON.parse(raw);
  }
}
