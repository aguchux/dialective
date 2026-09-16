import { IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { IsCryptoAddress } from '../../common/crypto-address.util';
import { IsValidStablecoinPair } from '../../common/stablecoin-pair.util';
import { STABLECOIN_ASSETS, STABLECOIN_NETWORKS } from '../stablecoin-networks';

const PAYOUT_ACCOUNT_TYPES = [
  'BANK',
  'MOBILE_MONEY',
  'STRIPE_CONNECT',
  'STABLECOIN_WALLET',
] as const;
export type CreatePayoutAccountType = (typeof PAYOUT_ACCOUNT_TYPES)[number];

export class CreatePayoutAccountDto {
  @IsIn(PAYOUT_ACCOUNT_TYPES)
  type!: CreatePayoutAccountType;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type !== 'STABLECOIN_WALLET')
  @IsString()
  @Length(2, 2)
  country?: string; // ISO 3166-1 alpha-2 -- a wallet has no country, it's the same everywhere

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type !== 'STABLECOIN_WALLET')
  @IsString()
  @Length(3, 3)
  currency?: string; // ISO 4217 -- STABLECOIN_WALLET uses stablecoinAsset instead

  // Required for a provider-verified (Flutterwave) BANK account, where it's
  // the code the trainer picked from the live bank list -- NOT required for
  // a free-entry BANK account, which instead takes a plain-text bankName
  // below (see PayoutAccountsController.create's free-entry branch).
  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'BANK' && !dto.freeEntry)
  @IsString()
  bankCode?: string;

  // Free-entry BANK only -- the trainer types their bank's name directly,
  // no admin-curated catalog or live Flutterwave list involved. Stored
  // as-is on PayoutAccount.bankName.
  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'BANK' && !!dto.freeEntry)
  @IsString()
  @Length(1, 120)
  bankName?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'BANK')
  @IsString()
  accountNumber?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'MOBILE_MONEY')
  @IsString()
  mobileMoneyNetwork?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'MOBILE_MONEY')
  @IsString()
  mobileMoneyNumber?: string;

  // Skips Flutterwave's resolveAccount/createRecipient calls for BANK, and
  // is always true in effect for MOBILE_MONEY (no v3 resolve endpoint
  // exists for it either way) -- see PayoutAccountsController.create's
  // free-entry branch. Saved as provider='manual', verificationStatus
  // UNVERIFIED, never blocks creation on a provider call failing/matching.
  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'BANK' || dto.type === 'MOBILE_MONEY')
  @IsOptional()
  @IsBoolean()
  freeEntry?: boolean;

  // STRIPE_CONNECT only needs country/currency (already required above) --
  // no bankCode/accountNumber/mobileMoneyNetwork/mobileMoneyNumber, since
  // Stripe collects the bank account itself on its own onboarding pages.

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsIn(STABLECOIN_ASSETS)
  stablecoinAsset?: (typeof STABLECOIN_ASSETS)[number];

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsIn(STABLECOIN_NETWORKS)
  @IsValidStablecoinPair('stablecoinAsset')
  stablecoinNetwork?: (typeof STABLECOIN_NETWORKS)[number];

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsCryptoAddress('stablecoinNetwork')
  walletAddress?: string;

  // Required for every type except STRIPE_CONNECT (Stripe's own hosted
  // onboarding is that rail's confirmation step) -- see
  // PayoutAccountsController.create and payoutAccountSetupContextHash.
  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type !== 'STRIPE_CONNECT')
  @IsString()
  otpRequestId?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type !== 'STRIPE_CONNECT')
  @IsString()
  @Length(6, 6)
  code?: string;

  @IsOptional()
  @IsIn([true, false])
  isDefault?: boolean;
}
