import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SubscriptionPoolStatus } from '@dialectiva/db';

export class ListSubscriptionPoolsDto {
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
  @IsEnum(SubscriptionPoolStatus)
  status?: SubscriptionPoolStatus;
}
