import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TestimonyStatus } from '@dialectiva/db';

const TESTIMONY_STATUSES = Object.values(TestimonyStatus);

export class ListTestimoniesAdminDto {
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
  @IsIn(TESTIMONY_STATUSES)
  status?: TestimonyStatus;
}
