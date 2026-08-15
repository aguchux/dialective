import { IsEnum, IsObject, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { BlogPostStatus, CourseVisibility } from '@dialectiva/db';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @Length(3, 180)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  summary?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  coverImageAlt?: string;

  @IsOptional()
  @IsEnum(BlogPostStatus)
  status?: BlogPostStatus;

  @IsOptional()
  @IsEnum(CourseVisibility)
  visibility?: CourseVisibility;
}
