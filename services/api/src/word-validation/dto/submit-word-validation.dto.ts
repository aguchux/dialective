import { ArrayUnique, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { WordValidationFlag } from '@dialectiva/db';

const WORD_VALIDATION_FLAGS = Object.values(WordValidationFlag);

export class SubmitWordValidationDto {
  @IsString()
  @IsNotEmpty()
  recordingId!: string;

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
