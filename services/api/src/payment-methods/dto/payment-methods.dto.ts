import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { PayoutAccountType } from '@dialectiva/db';

export class ListPaymentMethodsDto {
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsOptional()
  @IsIn([PayoutAccountType.BANK, PayoutAccountType.MOBILE_MONEY])
  type?: typeof PayoutAccountType.BANK | typeof PayoutAccountType.MOBILE_MONEY;
}

export class CreatePaymentMethodCatalogDto {
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsIn([PayoutAccountType.BANK, PayoutAccountType.MOBILE_MONEY])
  type!: typeof PayoutAccountType.BANK | typeof PayoutAccountType.MOBILE_MONEY;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePaymentMethodCatalogDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankCode?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export const ALLOWED_PAYMENT_METHOD_LOGO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
] as const;
export type AllowedPaymentMethodLogoContentType =
  (typeof ALLOWED_PAYMENT_METHOD_LOGO_CONTENT_TYPES)[number];

export class CreatePaymentMethodLogoUploadUrlDto {
  @IsIn(ALLOWED_PAYMENT_METHOD_LOGO_CONTENT_TYPES)
  contentType!: AllowedPaymentMethodLogoContentType;
}
