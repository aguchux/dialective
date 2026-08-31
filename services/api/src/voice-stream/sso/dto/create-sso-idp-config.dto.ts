import { IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { SubscriberOrgRole } from '@dialectiva/db';

export class CreateSsoIdpConfigDto {
  @IsString()
  @MinLength(1)
  idpEntityId!: string;

  @IsUrl({ require_tld: false })
  idpSsoUrl!: string;

  @IsString()
  @MinLength(1)
  idpCertificate!: string;

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
  defaultRole?: SubscriberOrgRole; // never OWNER -- see SsoIdpConfigService.create's validation
}
