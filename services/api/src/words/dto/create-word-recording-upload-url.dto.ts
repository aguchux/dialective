import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const ALLOWED_CONTENT_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  // iOS Safari's MediaRecorder supports none of the types above
  // (MediaRecorder.isTypeSupported returns false for all of them there), so
  // it silently falls back to audio/mp4 (AAC in an M4A container),
  // sometimes reported as audio/x-m4a -- without these, every iPhone
  // recording 400s here before a presigned URL is ever issued. Mirrors
  // community-attachments' create-community-attachment-upload-url.dto.ts fix
  // for the same underlying browser behavior.
  'audio/mp4',
  'audio/x-m4a',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export class CreateWordRecordingUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: AllowedContentType;
}
