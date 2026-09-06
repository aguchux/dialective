import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../../storage/storage.service';
import { CreateCommunityAttachmentUploadUrlDto } from '../dto/create-community-attachment-upload-url.dto';

const COMMUNITY_BUCKET = process.env.SPACES_COMMUNITY_BUCKET ?? 'dialectiva-community';
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
};

@Injectable()
export class CommunityAttachmentsService {
  constructor(private readonly storage: StorageService) {}

  /**
   * publicRead=true -- community content is already visible to any signed-in
   * member (there's no extra confidentiality to protect), and a stable
   * public URL avoids a presign round-trip every time a post/reply with
   * attachments renders on a feed. Same posture as approved testimonial
   * videos and DYK notice images elsewhere in this codebase.
   */
  async createUploadUrl(userId: string, dto: CreateCommunityAttachmentUploadUrlDto) {
    const extension = EXTENSION_BY_CONTENT_TYPE[dto.contentType];
    const key = `${userId}/${randomUUID()}.${extension}`;
    const { url, expiresInSeconds } = await this.storage.createPresignedUploadUrl(
      COMMUNITY_BUCKET,
      key,
      dto.contentType,
      true,
    );
    return { uploadUrl: url, key, bucket: COMMUNITY_BUCKET, expiresInSeconds };
  }

  publicUrl(bucket: string, key: string): string {
    return this.storage.getPublicObjectUrl(bucket, key);
  }
}
