import { IsEnum, IsObject, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { BlogPostStatus } from '@dialectiva/db';

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
}
