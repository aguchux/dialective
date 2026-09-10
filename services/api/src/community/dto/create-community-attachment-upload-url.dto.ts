import { IsIn } from 'class-validator';

export const ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  // iOS Safari's file/voice-memo picker produces audio/mp4 (AAC in an M4A
  // container), sometimes reported as audio/x-m4a -- without these, every
  // iOS audio attachment 400s here before a presigned URL is ever issued.
  'audio/mp4',
  'audio/x-m4a',
  'application/pdf',
] as const;
export type AllowedCommunityAttachmentContentType =
  (typeof ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES)[number];

export class CreateCommunityAttachmentUploadUrlDto {
  @IsIn(ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES)
  contentType!: AllowedCommunityAttachmentContentType;
}
