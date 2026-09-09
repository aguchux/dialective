import { Type } from 'class-transformer';
import { WithdrawalStatus } from '@dialectiva/db';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListWithdrawalsAdminDto {
  @IsOptional()
  @IsEnum(WithdrawalStatus)
  status?: WithdrawalStatus;

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

  /** Matches trainer email or destination crypto/bank/mobile address, case-insensitive. */
  @IsOptional()
  @IsString()
  search?: string;
}
