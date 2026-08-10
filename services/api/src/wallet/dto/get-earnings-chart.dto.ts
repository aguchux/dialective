import { IsIn, IsOptional } from 'class-validator';

export const EARNINGS_CHART_RANGES = ['week', 'month', 'year'] as const;
export type EarningsChartRange = (typeof EARNINGS_CHART_RANGES)[number];

export class GetEarningsChartDto {
  @IsOptional()
  @IsIn(EARNINGS_CHART_RANGES)
  range: EarningsChartRange = 'month';
}
