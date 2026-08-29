import { IsISO8601, IsOptional } from 'class-validator';

export class GetTrainerReportDto {
  /** Inclusive lower bound; omitted means "since signup". */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive upper bound; omitted means "now". */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
