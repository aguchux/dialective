import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../common/password-strength.util';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsString()
  @IsStrongPassword()
  password!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  campaignShareId?: string;
}
