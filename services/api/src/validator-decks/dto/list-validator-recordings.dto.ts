import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SubmissionStatus } from '@dialectiva/db';

export type ValidatorRecordingSortField = 'createdAt' | 'score' | 'compositeScore' | 'rawScore';

const SORT_FIELDS: ValidatorRecordingSortField[] = [
  'createdAt',
  'score',
  'compositeScore',
  'rawScore',
];

export class ListValidatorRecordingsDto {
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
  sortBy: ValidatorRecordingSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir: 'asc' | 'desc' = 'desc';

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
