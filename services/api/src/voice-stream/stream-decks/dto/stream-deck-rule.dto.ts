import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsvcConfidence } from '@dialectiva/db';

/** Smart Deck saved rule fields (doc section 9.3) -- same field set as SearchCatalogueDto, extended with subdialect/organizationCount/audioQuality. */
export class StreamDeckRuleDto {
  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsOptional()
  @IsString()
  subdialectTag?: string;

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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrganizationCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minAudioQuality?: number;
}
