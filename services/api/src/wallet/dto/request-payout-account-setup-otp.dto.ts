import { IsBoolean, IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { IsCryptoAddress } from '../../common/crypto-address.util';
import { IsValidStablecoinPair } from '../../common/stablecoin-pair.util';
import { STABLECOIN_ASSETS, STABLECOIN_NETWORKS } from '../stablecoin-networks';

const SETUP_OTP_TYPES = ['BANK', 'MOBILE_MONEY', 'STABLECOIN_WALLET'] as const;

/**
 * Issued before saving ANY payout account (see
 * PayoutAccountsController.requestSetupOtp) -- previously only
 * STABLECOIN_WALLET required this step; now every type does, confirming the
 * trainer actually intended to add exactly this destination before it's
 * saved and made available as a withdrawal/P2P receive option.
 */
export class RequestPayoutAccountSetupOtpDto {
  @IsIn(SETUP_OTP_TYPES)
  type!: (typeof SETUP_OTP_TYPES)[number];

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'BANK' && !dto.freeEntry)
  @IsString()
  bankCode?: string;

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'BANK' && !!dto.freeEntry)
  @IsString()
  @Length(1, 120)
  bankName?: string;

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'BANK')
  @IsString()
  accountNumber?: string;

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'MOBILE_MONEY')
  @IsString()
  mobileMoneyNetwork?: string;

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'MOBILE_MONEY')
  @IsString()
  mobileMoneyNumber?: string;

  // Whether this is a self-entered account skipping Flutterwave's
  // resolveAccount verification -- part of the OTP context so an OTP issued
  // for a free-entry BANK account can't be replayed to confirm a
  // provider-verified one with the same bankCode/accountNumber, or vice
  // versa (their resulting verificationStatus differs).
  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type !== 'STABLECOIN_WALLET')
  @IsBoolean()
  freeEntry?: boolean;

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'STABLECOIN_WALLET')
  @IsIn(STABLECOIN_ASSETS)
  stablecoinAsset?: (typeof STABLECOIN_ASSETS)[number];

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'STABLECOIN_WALLET')
  @IsIn(STABLECOIN_NETWORKS)
  @IsValidStablecoinPair('stablecoinAsset')
  stablecoinNetwork?: (typeof STABLECOIN_NETWORKS)[number];

  @ValidateIf((dto: RequestPayoutAccountSetupOtpDto) => dto.type === 'STABLECOIN_WALLET')
  @IsCryptoAddress('stablecoinNetwork')
  walletAddress?: string;
}
