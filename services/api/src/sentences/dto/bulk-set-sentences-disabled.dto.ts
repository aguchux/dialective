import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Same two mutually exclusive modes as BulkDeleteSentencesAdminDto: `ids`
 * ("selected") or `search`/`disabled` ("Clear All"-style, matching the
 * currently displayed filter). `disabled` here is the CURRENT filter (which
 * tab is showing), same as bulk-delete's -- the NEW disabled value to apply
 * is the separate top-level `setDisabled` field.
 */
export class BulkSetSentencesDisabledDto {
  @ValidateIf((dto: BulkSetSentencesDisabledDto) => dto.ids !== undefined)
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
  @Type(() => Boolean)
  @IsBoolean()
  disabled?: boolean;
}
