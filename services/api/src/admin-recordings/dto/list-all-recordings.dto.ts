import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AdminAuditStatus, SubmissionStatus } from '@dialectiva/db';

export type RecordingSortField = 'createdAt' | 'score' | 'compositeScore' | 'rawScore' | 'payoutTokenAmount';

const SORT_FIELDS: RecordingSortField[] = ['createdAt', 'score', 'compositeScore', 'rawScore', 'payoutTokenAmount'];

export class ListAllRecordingsDto {
  @IsIn(['word', 'submission'])
  kind!: 'word' | 'submission';

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
  @IsIn(SORT_FIELDS)
  sortBy: RecordingSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';

  // Matches word text (kind=word) or prompt text (both kinds), case-insensitive contains.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @IsOptional()
  @IsEnum(AdminAuditStatus)
  adminAuditStatus?: AdminAuditStatus;

  // 'unreviewed' filters adminAuditStatus IS NULL -- not itself a valid AdminAuditStatus value.
  @IsOptional()
  @IsIn(['unreviewed'])
  reviewState?: 'unreviewed';

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  maxScore?: number;
}
