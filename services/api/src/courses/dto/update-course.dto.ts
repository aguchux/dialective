import { IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min } from 'class-validator';
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

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  // Omitted leaves the current value untouched; 0 (or a future "clear"
  // affordance) sets no-reward -- see CreateCourseDto's field for the shape.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  completionRewardTokens?: number;
}
