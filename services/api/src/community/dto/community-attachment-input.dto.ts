import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES } from './create-community-attachment-upload-url.dto';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Describes one already-uploaded (via CommunityAttachmentsService's
 * presigned URL) object to attach to a post/reply -- the client uploads the
 * bytes directly to Spaces first, then submits this metadata alongside the
 * post/reply body so the server can create the CommunityAttachment row
 * without re-deriving size/mimeType/name from the storage key itself.
 */
export class CommunityAttachmentInputDto {
  @IsString()
  key!: string;

  @IsString()
  bucket!: string;

  @IsIn(ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_ATTACHMENT_BYTES)
  size!: number;

  @IsString()
  @MaxLength(255)
  originalName!: string;
}
