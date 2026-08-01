import { Body, Controller, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

const SUBMISSIONS_BUCKET = process.env.SPACES_SUBMISSIONS_BUCKET ?? 'dialectiva-submissions';

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Issues a presigned Spaces upload URL for a new submission. The trainer's
   * client PUTs audio bytes directly to `url`; audio never transits `api`.
   * Caller then POSTs the returned `submissionId`/`key` to the (future)
   * submission-creation endpoint to enqueue the asr-jobs message.
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
}
