import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BlogPostStatus, CourseVisibility } from '@dialectiva/db';

export class CreateCourseDto {
  @IsString()
  @Length(3, 180)
  title!: string;

  @IsString()
  @Length(1, 500)
  summary!: string;

  // Raw document shape { slides: CourseSlideInput[] }, validated by
  // validateCourseDocument in course-content.util.ts -- same "DTO takes the
  // whole document, service validates its internal shape" split as
  // CreateBlogPostDto.content.
  @IsObject()
  content!: Record<string, unknown>;

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

  // When true (and status is PUBLISHED), trainers must complete this course
  // before starting a word-training session or submitting a sentence -- see
  // CoursesService.getIncompleteRequiredCourses.
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  // One-time DL credited the first time a trainer completes this course.
  // Omitted or 0 means no reward.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  completionRewardTokens?: number;
}
