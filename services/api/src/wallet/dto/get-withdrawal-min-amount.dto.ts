import { IsIn } from 'class-validator';
import { STABLECOIN_ASSETS, STABLECOIN_NETWORKS } from '../stablecoin-networks';

export class GetWithdrawalMinAmountDto {
  @IsIn(STABLECOIN_ASSETS)
  currency!: (typeof STABLECOIN_ASSETS)[number];

  @IsIn(STABLECOIN_NETWORKS)
  network!: (typeof STABLECOIN_NETWORKS)[number];
}
