import { IsEnum, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidatorItemStatus } from '@dialectiva/db';

export class ScoreValidatorDeckItemDto {
  @IsEnum(ValidatorItemStatus)
  status!: ValidatorItemStatus;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
