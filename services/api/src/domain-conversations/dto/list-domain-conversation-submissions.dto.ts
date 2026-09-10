import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SubmissionStatus } from '@dialectiva/db';

const SUBMISSION_STATUSES = Object.values(SubmissionStatus);

/** Mirrors ListSubmissionsDto (words) -- same comma-separated status query shape. */
export class ListDomainConversationSubmissionsDto {
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
