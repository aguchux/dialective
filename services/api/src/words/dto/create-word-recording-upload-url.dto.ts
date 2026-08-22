import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const ALLOWED_CONTENT_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export class CreateWordRecordingUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: AllowedContentType;
}
