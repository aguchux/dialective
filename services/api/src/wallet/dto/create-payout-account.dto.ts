import { IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { IsTronAddress } from '../../common/tron-address.util';

const PAYOUT_ACCOUNT_TYPES = [
  'BANK',
  'MOBILE_MONEY',
  'STRIPE_CONNECT',
  'STABLECOIN_WALLET',
] as const;
export type CreatePayoutAccountType = (typeof PAYOUT_ACCOUNT_TYPES)[number];

// Only TRC20 is offered today -- cheapest network with the deepest regional
// liquidity for the markets trainers actually cash out in (see
// StripeConnectService/FlutterwaveV4Service doc comments for the equivalent
// per-rail country reasoning). Widening to other networks (BEP20/Polygon)
// is a later, separate change, not a bigger union here.
const STABLECOIN_NETWORKS = ['TRC20'] as const;
const STABLECOIN_ASSETS = ['USDT', 'USDC'] as const;

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

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsIn(STABLECOIN_ASSETS)
  stablecoinAsset?: (typeof STABLECOIN_ASSETS)[number];

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsIn(STABLECOIN_NETWORKS)
  stablecoinNetwork?: (typeof STABLECOIN_NETWORKS)[number];

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsTronAddress()
  walletAddress?: string;

  // Required only for STABLECOIN_WALLET -- see
  // PayoutAccountsController.create and stablecoinWalletSetupContextHash.
  // Not needed for the other types, which have no OTP-confirmed-setup step.
  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsString()
  otpRequestId?: string;

  @ValidateIf((dto: CreatePayoutAccountDto) => dto.type === 'STABLECOIN_WALLET')
  @IsString()
  @Length(6, 6)
  code?: string;

  @IsOptional()
  @IsIn([true, false])
  isDefault?: boolean;
}
