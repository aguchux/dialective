import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { KycStatus } from '@dialectiva/db';

export class AdminDeclineKycDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class AdminListKycDto {
  @IsOptional()
  @IsEnum(KycStatus)
  status?: KycStatus;

  /** Matches against the verification's user: name, email, or mobile number (case-insensitive substring). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
