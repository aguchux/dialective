import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { WhatsAppValidationRequestStatus } from '@dialectiva/db';

export class ListAdminWhatsAppValidationsDto {
  @IsOptional()
  @IsEnum(WhatsAppValidationRequestStatus)
  status?: WhatsAppValidationRequestStatus;

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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['requester', 'claimant', 'phone', 'status', 'createdAt'])
  sortBy: 'requester' | 'claimant' | 'phone' | 'status' | 'createdAt' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
