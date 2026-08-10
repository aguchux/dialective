import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SubmissionStatus } from '@dialectiva/db';

const SUBMISSION_STATUSES = Object.values(SubmissionStatus);

/**
 * Accepts a comma-separated status list (?status=PENDING,TRANSCRIBED)
 * rather than repeated query keys -- fetchBaseQuery's default params
 * serializer stringifies array values via a single URLSearchParams entry
 * (comma-joined), it does not repeat the key per array item.
 */
export class ListSubmissionsDto {
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

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsIn(SUBMISSION_STATUSES, { each: true })
  status?: SubmissionStatus[];
}
