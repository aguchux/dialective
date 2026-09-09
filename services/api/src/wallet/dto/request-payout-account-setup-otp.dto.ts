import { IsIn } from 'class-validator';
import { IsCryptoAddress } from '../../common/crypto-address.util';
import { IsValidStablecoinPair } from '../../common/stablecoin-pair.util';
import { STABLECOIN_ASSETS, STABLECOIN_NETWORKS } from '../stablecoin-networks';

/** Only STABLECOIN_WALLET needs an OTP request before creation -- see PayoutAccountsController.requestStablecoinWalletSetupOtp. */
export class RequestPayoutAccountSetupOtpDto {
  @IsIn(STABLECOIN_ASSETS)
  stablecoinAsset!: (typeof STABLECOIN_ASSETS)[number];

  @IsIn(STABLECOIN_NETWORKS)
  @IsValidStablecoinPair('stablecoinAsset')
  stablecoinNetwork!: (typeof STABLECOIN_NETWORKS)[number];

  @IsCryptoAddress('stablecoinNetwork')
  walletAddress!: string;
}
