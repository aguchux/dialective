import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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
  pageSize = 5;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['user', 'phone', 'status', 'sentAt', 'createdAt'])
  sortBy: 'user' | 'phone' | 'status' | 'sentAt' | 'createdAt' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
