import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSupportRequestResolutionDto {
  @IsBoolean()
  resolved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
