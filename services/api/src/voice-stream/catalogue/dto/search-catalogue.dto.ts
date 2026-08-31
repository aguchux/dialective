import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsvcConfidence } from '@dialectiva/db';

export class SearchCatalogueDto {
  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minIsvs?: number;

  @IsOptional()
  @IsEnum(IsvcConfidence)
  minConfidence?: IsvcConfidence;

  @IsOptional()
  @IsEnum(['newest', 'isvs_desc'])
  sortBy?: 'newest' | 'isvs_desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
