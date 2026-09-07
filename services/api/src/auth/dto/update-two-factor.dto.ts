import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateTwoFactorDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;
}
