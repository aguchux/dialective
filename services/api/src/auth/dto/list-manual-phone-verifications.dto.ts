import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ManualPhoneVerificationStatus } from '@dialectiva/db';

export class ListManualPhoneVerificationsDto {
  @IsOptional()
  @IsEnum(ManualPhoneVerificationStatus)
  status?: ManualPhoneVerificationStatus;

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
