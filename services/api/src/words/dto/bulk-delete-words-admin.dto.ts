import { PartOfSpeech } from '@dialectiva/db';
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Two mutually exclusive modes, same as the admin words list's own filters:
 *  - `ids`: delete exactly these rows ("delete selected").
 *  - `search`/`partOfSpeech` (ids omitted): delete every row currently
 *    matching that filter ("Clear All"), mirroring ListWordsAdminDto so the
 *    admin UI can pass the same filter state it's already displaying.
 */
export class BulkDeleteWordsAdminDto {
  @ValidateIf((dto: BulkDeleteWordsAdminDto) => dto.ids !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech;
}
