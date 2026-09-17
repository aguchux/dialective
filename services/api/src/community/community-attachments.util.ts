import { CommunityAttachmentType } from '@dialectiva/db';
import { StorageService } from '../storage/storage.service';
import { CommunityAttachmentInputDto } from './dto/community-attachment-input.dto';

const ATTACHMENT_TYPE_BY_CONTENT_TYPE: Record<string, CommunityAttachmentType> = {
  'image/jpeg': CommunityAttachmentType.IMAGE,
  'image/png': CommunityAttachmentType.IMAGE,
  'image/webp': CommunityAttachmentType.IMAGE,
  'audio/mpeg': CommunityAttachmentType.AUDIO,
  'audio/wav': CommunityAttachmentType.AUDIO,
  'audio/webm': CommunityAttachmentType.AUDIO,
  'audio/mp4': CommunityAttachmentType.AUDIO,
  'audio/x-m4a': CommunityAttachmentType.AUDIO,
  'application/pdf': CommunityAttachmentType.DOCUMENT,
};

/**
 * Maps client-submitted attachment metadata (already uploaded to Spaces via
 * CommunityAttachmentsService's presigned URL) into CommunityAttachment
 * `create` inputs. The client is trusted for size/mimeType/originalName the
 * same way TestimonialsService trusts the uploader for its video metadata --
 * this is display/bookkeeping data, not a security boundary (the object key
 * itself is always server-generated, see CommunityAttachmentsService).
 */
export function attachmentsCreateInput(attachments: CommunityAttachmentInputDto[]) {
  return attachments.map((attachment) => ({
    bucket: attachment.bucket,
    storageKey: attachment.key,
    type:
      ATTACHMENT_TYPE_BY_CONTENT_TYPE[attachment.contentType] ?? CommunityAttachmentType.DOCUMENT,
    mimeType: attachment.contentType,
    size: attachment.size,
    originalName: attachment.originalName,
  }));
}

/**
 * Maps a persisted CommunityAttachment row to its API-facing shape, adding
 * the computed public URL (attachments are publicRead, see
 * CommunityAttachmentsService.createUploadUrl) rather than storing it
 * redundantly in Postgres.
 */
export function toAttachmentDto(
  storage: StorageService,
  attachment: {
    id: string;
    type: CommunityAttachmentType;
    bucket: string;
    storageKey: string;
    mimeType: string;
    size: number;
    originalName: string;
  },
) {
  return {
    id: attachment.id,
    type: attachment.type,
    bucket: attachment.bucket,
    storageKey: attachment.storageKey,
    mimeType: attachment.mimeType,
    size: attachment.size,
    originalName: attachment.originalName,
    url: storage.getPublicObjectUrl(attachment.bucket, attachment.storageKey),
  };
}
