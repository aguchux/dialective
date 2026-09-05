import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class UpsertCommunitySpaceDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens only',
  })
  @MaxLength(80)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  rules?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
