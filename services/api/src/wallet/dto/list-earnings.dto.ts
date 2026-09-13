import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

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

  /**
   * Restricts /wallet/activity to one of the two ledger-type buckets the
   * trainer-facing "Tokens earned"/"Other credits" cards summarize -- lets
   * each card link to its own filtered slice of history instead of the full
   * unfiltered activity feed. Unset (default) returns everything, same as
   * before this param existed. See trainer-report.service.ts's
   * LIFETIME_CREDIT_ENTRY_TYPES/EXTERNAL_TOPUP_ENTRY_TYPES for the exact
   * type sets each bucket maps to.
   */
  @IsOptional()
  @IsIn(['earned', 'other-credits'])
  category?: 'earned' | 'other-credits';
}
