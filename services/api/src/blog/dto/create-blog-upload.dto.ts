import { IsEnum, IsString, MaxLength, Matches } from 'class-validator';

export enum BlogMediaKind {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export class CreateBlogUploadDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @Matches(/^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|ogg|quicktime))$/)
  contentType!: string;

  @IsEnum(BlogMediaKind)
  kind!: BlogMediaKind;
}
