import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

// Sanity ceiling on a single bulk grant, well above any realistic real-world
// allocation (the spec's own example is 1,000,000) but far under the
// Decimal(20,8) column's actual range -- guards against an admin fat-
// fingering an extra zero or two and minting an absurd balance with no
// confirmation step in between.
const MAX_ALLOCATION_TOKEN_AMOUNT = 100_000_000;

export class UpdateDistributorSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  bulkAllocationEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultBulkDiscountRate?: number;

  @IsOptional()
  @IsBoolean()
  multiLevelReferralEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxReferralDepth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  level1Rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  level2Rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  level3Rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  level4Rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  level5Rate?: number;
}

export class CreateDistributorAllocationDto {
  @IsNumber()
  @IsPositive()
  @Max(MAX_ALLOCATION_TOKEN_AMOUNT)
  tokenAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  discountRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListDistributorAllocationsDto {
  @IsOptional()
  @IsUUID()
  distributorId?: string;

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
}
