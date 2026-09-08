import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ValidatorFlagReason } from '@dialectiva/db';

export class FlagValidatorDeckItemDto {
  @IsEnum(ValidatorFlagReason)
  reason!: ValidatorFlagReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
