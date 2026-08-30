import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMarketingHeadlineDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
