import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateWithdrawalDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  // Required only for the default/omitted CRYPTO path -- a BANK/MOBILE_MONEY
  // withdrawal has no address, it references a saved PayoutAccount instead.
  @ValidateIf((dto: CreateWithdrawalDto) => (dto.payoutMethod ?? 'CRYPTO') === 'CRYPTO')
  @IsString()
  @IsNotEmpty()
  destinationAddress?: string;

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
    (dto: CreateWithdrawalDto) => Boolean(dto.payoutMethod) && dto.payoutMethod !== 'CRYPTO',
  )
  @IsUUID()
  payoutAccountId?: string;

  @IsUUID()
  otpRequestId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
