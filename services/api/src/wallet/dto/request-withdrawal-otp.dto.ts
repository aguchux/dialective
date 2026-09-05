import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class RequestWithdrawalOtpDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  // Required only for the default/omitted CRYPTO path (a fresh, typed-each-
  // time address) -- NOT for CRYPTO_SAVED, which resolves its address from
  // the referenced PayoutAccount instead. See create-withdrawal.dto.ts's
  // identical guard.
  @ValidateIf((dto: RequestWithdrawalOtpDto) => (dto.payoutMethod ?? 'CRYPTO') === 'CRYPTO')
  @IsString()
  @IsNotEmpty()
  destinationAddress?: string;

  // Allow-listed against PlatformSettings.allowedWithdrawalCurrencies/Networks
  // in the controller (not here) since the DTO can't reach the DB -- these
  // just constrain to the values NowPaymentsService actually understands.
  @IsOptional()
  @IsIn(['USDT', 'USDC'])
  destinationCurrency?: string;

  @IsOptional()
  @IsIn(['TRC20', 'ERC20', 'BEP20', 'SOL', 'POLYGON'])
  destinationNetwork?: string;

  // CRYPTO_SAVED withdraws to a saved STABLECOIN_WALLET PayoutAccount
  // (address resolved server-side, never re-typed) -- distinct from CRYPTO,
  // which still takes a freshly-typed destinationAddress every time. Both
  // produce a PayoutMethod.CRYPTO WithdrawalRequest row and flow through the
  // same NOWPayments submission pipeline; see
  // WalletController.validateFiatWithdrawalRequest's STABLECOIN_WALLET
  // branch and createWithdrawal's isCryptoSaved handling.
  @IsOptional()
  @IsIn(['CRYPTO', 'CRYPTO_SAVED', 'BANK', 'MOBILE_MONEY', 'STRIPE'])
  payoutMethod?: 'CRYPTO' | 'CRYPTO_SAVED' | 'BANK' | 'MOBILE_MONEY' | 'STRIPE';

  @ValidateIf(
    (dto: RequestWithdrawalOtpDto) => Boolean(dto.payoutMethod) && dto.payoutMethod !== 'CRYPTO',
  )
  @IsUUID()
  payoutAccountId?: string;
}
