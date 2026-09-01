import { IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

const PAYOUT_ACCOUNT_TYPES = ['BANK', 'MOBILE_MONEY', 'STRIPE_CONNECT'] as const;
export type CreatePayoutAccountType = (typeof PAYOUT_ACCOUNT_TYPES)[number];

export class CreatePayoutAccountDto {
  @IsIn(PAYOUT_ACCOUNT_TYPES)
  type!: CreatePayoutAccountType;

  @IsString()
  @Length(2, 2)
  country!: string; // ISO 3166-1 alpha-2

  @IsString()
  @Length(3, 3)
  currency!: string; // ISO 4217

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'BANK')
  @IsString()
  bankCode?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'BANK')
  @IsString()
  accountNumber?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'MOBILE_MONEY')
  @IsString()
  mobileMoneyNetwork?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'MOBILE_MONEY')
  @IsString()
  mobileMoneyNumber?: string;

  // STRIPE_CONNECT only needs country/currency (already required above) --
  // no bankCode/accountNumber/mobileMoneyNetwork/mobileMoneyNumber, since
  // Stripe collects the bank account itself on its own onboarding pages.

  @IsOptional()
  @IsIn([true, false])
  isDefault?: boolean;
}
