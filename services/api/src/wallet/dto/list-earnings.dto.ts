import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class ListEarningsDto {
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
  pageSize = 10;

  /** Inclusive lower bound, e.g. one earnings-chart bucket's start -- lets a chart bar link to its own filtered slice of history. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Exclusive upper bound, paired with `from`. */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
