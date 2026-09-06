import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Two mutually exclusive modes, same as the admin sentences list's own
 * filter:
 *  - `ids`: delete exactly these rows ("delete selected").
 *  - `search`/`disabled` (ids omitted): delete every row currently matching
 *    that filter ("Clear All"), mirroring ListSentencesAdminDto so the admin
 *    UI can pass the same filter state (including which tab it's showing)
 *    it's already displaying.
 */
export class BulkDeleteSentencesAdminDto {
  @ValidateIf((dto: BulkDeleteSentencesAdminDto) => dto.ids !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  disabled?: boolean;
}
