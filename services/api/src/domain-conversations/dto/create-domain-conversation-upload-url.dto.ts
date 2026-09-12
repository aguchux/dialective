import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const ALLOWED_CONTENT_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  // iOS Safari's MediaRecorder supports none of the types above and
  // silently falls back to audio/mp4 (AAC in an M4A container), sometimes
  // reported as audio/x-m4a -- without these, every iPhone recording 400s
  // here before a presigned URL is ever issued. Same fix as
  // words/dto/create-word-recording-upload-url.dto.ts and
  // community-attachments' upload DTO.
  'audio/mp4',
  'audio/x-m4a',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export class CreateDomainConversationUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: AllowedContentType;
}
