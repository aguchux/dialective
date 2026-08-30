import { IsIn } from 'class-validator';

export const ALLOWED_TESTIMONY_VIDEO_CONTENT_TYPES = ['video/webm', 'video/mp4'] as const;
export type AllowedTestimonyVideoContentType =
  (typeof ALLOWED_TESTIMONY_VIDEO_CONTENT_TYPES)[number];

export class CreateTestimonyUploadUrlDto {
  @IsIn(ALLOWED_TESTIMONY_VIDEO_CONTENT_TYPES)
  contentType!: AllowedTestimonyVideoContentType;
}
