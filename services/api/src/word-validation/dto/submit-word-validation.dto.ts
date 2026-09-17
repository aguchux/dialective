import { ArrayUnique, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { WordValidationFlag } from '@dialectiva/db';

const WORD_VALIDATION_FLAGS = Object.values(WordValidationFlag);

export class SubmitWordValidationDto {
  @IsString()
  @IsNotEmpty()
  recordingId!: string;

  // Echoed back from nextItem's response -- proves server-side how long ago
  // this item was actually served, so submit() can reject rapid/no-listen
  // submissions. Optional only so a legacy/cached client that never sent it
  // fails the min-seconds check gracefully (no reward) rather than a hard
  // 400 -- see WordValidationService.submit.
  @IsOptional()
  @IsString()
  presentmentToken?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  selectedWordId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  transcript?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(WORD_VALIDATION_FLAGS, { each: true })
  flags?: WordValidationFlag[];
}
