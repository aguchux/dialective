import { IsBoolean, IsEnum, IsOptional, IsUUID, Length } from 'class-validator';
import { Gender } from '@dialectiva/db';

export class UpdateProfileDto {
  @IsOptional()
  @IsUUID()
  originCountryId?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsUUID()
  dialectId?: string;

  // Subdialect (see DialectVariant). Optional at the DTO level since this
  // same endpoint also handles unrelated profile fields (name, gender,
  // notification prefs) -- AuthService.updateProfile enforces that a
  // dialectVariantId is REQUIRED whenever dialectId is being set/changed,
  // the same "app-level invariant, not DB constraint" convention already
  // used for country/dialect. No longer clearable via '' -- every dialect
  // has at least a "Basic <Name>" variant seeded, so there is no valid
  // "dialect with no subdialect" state to clear into.
  @IsOptional()
  @IsUUID()
  dialectVariantId?: string;

  @IsOptional()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @Length(1, 80)
  lastName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

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
