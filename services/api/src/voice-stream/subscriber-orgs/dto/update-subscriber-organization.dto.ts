import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateSubscriberOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companySize?: string;
}
