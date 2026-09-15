import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListIntegrationsDto {
  // Matched against name/description/category, case-insensitive substring.
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['name', 'category', 'createdAt', 'sortOrder'])
  sortBy?: 'name' | 'category' | 'createdAt' | 'sortOrder' = 'sortOrder';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'asc';
}

/**
 * Admin's only write path onto an Integration row -- deliberately has no
 * name/description/category/iconKey/slug fields. Those are owned by
 * INTEGRATION_REGISTRY (see integration-registry.ts) and refreshed on
 * every boot; an integration is created by implementing it in code, not
 * by an admin typing metadata into a form. This DTO only gates an
 * already-registered row: whether it's live, what it costs, and where it
 * sorts in the marketplace.
 */
export class UpdateIntegrationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  feeTokenAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}
