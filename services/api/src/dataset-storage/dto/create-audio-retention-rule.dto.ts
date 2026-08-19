import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateAudioRetentionRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsString()
  dialectTag?: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays!: number;
}
