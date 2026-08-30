import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class UpdateMarketingPhotoDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
