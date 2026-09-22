import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { VdclVersionStatus } from '@dialectiva/db';

export class ListVdclAgreementsDto {
  @IsOptional()
  @IsEnum(VdclVersionStatus)
  status?: VdclVersionStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

/**
 * A reason is REQUIRED for suspension and withdrawal, not optional. Both
 * stop a contributor's work reaching subscribers, and an unexplained one is
 * unanswerable later -- the audit row is the only record of why.
 */
export class VdclReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
