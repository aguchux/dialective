import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StreamDeckType } from '@dialectiva/db';
import { StreamDeckRuleDto } from './stream-deck-rule.dto';

export class CreateStreamDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(StreamDeckType)
  type?: StreamDeckType;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsOptional()
  @IsString()
  subdialectTag?: string;

  /** Required when type=SMART -- doc 9.3 frames Smart Deck as a deck type created with its rule, not an optional add-on. */
  @IsOptional()
  @ValidateNested()
  @Type(() => StreamDeckRuleDto)
  rule?: StreamDeckRuleDto;
}
