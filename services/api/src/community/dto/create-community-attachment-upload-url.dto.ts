import { IsIn } from 'class-validator';

export const ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'application/pdf',
] as const;
export type AllowedCommunityAttachmentContentType =
  (typeof ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES)[number];

export class CreateCommunityAttachmentUploadUrlDto {
  @IsIn(ALLOWED_COMMUNITY_ATTACHMENT_CONTENT_TYPES)
  contentType!: AllowedCommunityAttachmentContentType;
}
