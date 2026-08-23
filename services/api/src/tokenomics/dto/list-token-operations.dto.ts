import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TokenOperationStatus, TokenOperationType } from '@dialectiva/db';

export class ListTokenOperationsDto {
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
  @IsEnum(TokenOperationType)
  type?: TokenOperationType;

  @IsOptional()
  @IsEnum(TokenOperationStatus)
  status?: TokenOperationStatus;
}
