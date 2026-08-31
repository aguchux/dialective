import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SetDeckLicenseDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  termsSummary!: string;

  @IsOptional()
  @IsBoolean()
  attributionRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  redistributionAllowed?: boolean;
}
