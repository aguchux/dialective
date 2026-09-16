import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetAnalyticsReportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days = 30;
}

export class GetAnalyticsBreakdownDto extends GetAnalyticsReportDto {
  @IsIn(['page', 'country', 'deviceCategory'])
  dimension!: string;
}
