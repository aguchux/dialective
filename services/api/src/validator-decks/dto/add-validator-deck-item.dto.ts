import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ValidatorRecordKind } from '@dialectiva/db';

export class AddValidatorDeckItemDto {
  @IsString()
  recordingId!: string;

  // Defaults to WORD_RECORDING when omitted -- pre-existing callers (every
  // client built before Domain Conversation shipped) never send this field.
  @IsOptional()
  @IsEnum(ValidatorRecordKind)
  recordKind?: ValidatorRecordKind;
}
