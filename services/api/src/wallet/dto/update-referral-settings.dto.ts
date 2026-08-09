import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateReferralSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fundingBonusRate?: number;

  @IsOptional()
  @IsBoolean()
  fundingBonusEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  payoutBonusRate?: number;

  @IsOptional()
  @IsBoolean()
  payoutBonusEnabled?: boolean;
}
