import { ArrayNotEmpty, IsArray, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Two mutually exclusive modes, same as the admin sentences list's own
 * filter:
 *  - `ids`: delete exactly these rows ("delete selected").
 *  - `search` (ids omitted): delete every row currently matching that
 *    filter ("Clear All"), mirroring ListSentencesAdminDto.
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
}
