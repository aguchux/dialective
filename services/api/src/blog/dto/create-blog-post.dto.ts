import { IsEnum, IsObject, IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from 'class-validator';
import { BlogPostStatus } from '../../generated/prisma/client';

export class CreateBlogPostDto {
  @IsString()
  @Length(3, 180)
  title!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(190)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tag?: string;

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
