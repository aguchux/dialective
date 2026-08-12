import { Type } from 'class-transformer';
import { PartOfSpeech } from '@dialectiva/db';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListWordsAdminDto {
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
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech;
}
