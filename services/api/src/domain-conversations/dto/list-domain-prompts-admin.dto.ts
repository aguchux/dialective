import { Transform, Type } from 'class-transformer';
import { DomainPromptGenderVariant } from '@dialectiva/db';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListDomainPromptsAdminDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsEnum(DomainPromptGenderVariant)
  genderVariant?: DomainPromptGenderVariant;

  /** Prompts tab omits this (defaults to active-only); Disabled tab passes true. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  disabled = false;
}
