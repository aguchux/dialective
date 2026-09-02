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

  // Required only for the default/omitted CRYPTO path -- see
  // create-withdrawal.dto.ts's identical guard.
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

  @IsOptional()
  @IsIn(['CRYPTO', 'BANK', 'MOBILE_MONEY', 'STRIPE'])
  payoutMethod?: 'CRYPTO' | 'BANK' | 'MOBILE_MONEY' | 'STRIPE';

  @ValidateIf(
    (dto: RequestWithdrawalOtpDto) => Boolean(dto.payoutMethod) && dto.payoutMethod !== 'CRYPTO',
  )
  @IsUUID()
  payoutAccountId?: string;
}
