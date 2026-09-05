import { IsIn } from 'class-validator';
import { IsTronAddress } from '../../common/tron-address.util';

const STABLECOIN_NETWORKS = ['TRC20'] as const;
const STABLECOIN_ASSETS = ['USDT', 'USDC'] as const;

/** Only STABLECOIN_WALLET needs an OTP request before creation -- see PayoutAccountsController.requestStablecoinWalletSetupOtp. */
export class RequestPayoutAccountSetupOtpDto {
  @IsIn(STABLECOIN_ASSETS)
  stablecoinAsset!: (typeof STABLECOIN_ASSETS)[number];

  @IsIn(STABLECOIN_NETWORKS)
  stablecoinNetwork!: (typeof STABLECOIN_NETWORKS)[number];

  @IsTronAddress()
  walletAddress!: string;
}
