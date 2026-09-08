import { Type } from 'class-transformer';
import { PartOfSpeech } from '@dialectiva/db';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

/**
 * Same two mutually exclusive modes as BulkDeleteWordsAdminDto: `ids`
 * ("selected") or `search`/`partOfSpeech`/`disabled` ("Clear All"-style,
 * matching the currently displayed filter). `disabled` here is the CURRENT
 * filter (which tab is showing), same as bulk-delete's -- the NEW disabled
 * value to apply is the separate top-level `setDisabled` field.
 */
export class BulkSetWordsDisabledDto {
  @ValidateIf((dto: BulkSetWordsDisabledDto) => dto.ids !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids?: string[];

  @IsBoolean()
  setDisabled!: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  disabled?: boolean;
}
