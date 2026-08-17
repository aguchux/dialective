import { IsBoolean, IsOptional, IsUUID, Length, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsUUID()
  dialectId?: string;

  // Optional sub-dialect (see DialectVariant). '' explicitly clears the
  // current selection -- ValidateIf skips the UUID check for that case so
  // an empty string is a valid "clear" signal, not a validation error.
  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsUUID()
  dialectVariantId?: string;

  @IsOptional()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @Length(1, 80)
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  blogNewsNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  courseNotificationsEnabled?: boolean;
}
