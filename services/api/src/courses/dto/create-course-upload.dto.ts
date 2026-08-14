import { IsEnum, IsString, MaxLength, Matches } from 'class-validator';

export enum CourseMediaKind {
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
}

export class CreateCourseUploadDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @Matches(/^(image\/(jpeg|png|webp|gif|avif)|audio\/(mpeg|mp3|wav|ogg|webm))$/)
  contentType!: string;

  @IsEnum(CourseMediaKind)
  kind!: CourseMediaKind;
}
