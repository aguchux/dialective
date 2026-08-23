import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReserveDirection, ReserveTransactionStatus, ReserveTransactionType } from '@dialectiva/db';

export class ListReserveTransactionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;

  @IsOptional()
  @IsEnum(ReserveTransactionType)
  type?: ReserveTransactionType;

  @IsOptional()
  @IsEnum(ReserveTransactionStatus)
  status?: ReserveTransactionStatus;

  @IsOptional()
  @IsEnum(ReserveDirection)
  direction?: ReserveDirection;
}
