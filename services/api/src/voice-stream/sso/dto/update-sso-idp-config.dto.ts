import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { SubscriberOrgRole } from '@dialectiva/db';

export class UpdateSsoIdpConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  idpEntityId?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  idpSsoUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  idpCertificate?: string;

  @IsOptional()
  @IsString()
  nameIdFormat?: string;

  @IsOptional()
  @IsString()
  emailAttribute?: string;

  @IsOptional()
  @IsString()
  firstNameAttribute?: string;

  @IsOptional()
  @IsString()
  lastNameAttribute?: string;

  @IsOptional()
  @IsEnum(SubscriberOrgRole)
  defaultRole?: SubscriberOrgRole; // never OWNER -- see SsoIdpConfigService.update's validation

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
