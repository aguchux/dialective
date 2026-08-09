import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateReferralProgramDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
