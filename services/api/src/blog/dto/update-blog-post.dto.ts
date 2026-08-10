import { IsEnum, IsObject, IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { BlogPostStatus } from '../../generated/prisma/client';

export class UpdateBlogPostDto {
  @IsOptional()
  @IsString()
  @Length(3, 180)
  title?: string;

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
}
