import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RequestWithdrawalOtpDto {
  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  // Allow-listed against PlatformSettings.allowedWithdrawalCurrencies/Networks
  // in the controller (not here) since the DTO can't reach the DB -- these
  // just constrain to the values NowPaymentsService actually understands.
  @IsOptional()
  @IsIn(['USDT', 'USDC'])
  destinationCurrency?: string;

  @IsOptional()
  @IsIn(['TRC20', 'ERC20', 'BEP20', 'SOL', 'POLYGON'])
  destinationNetwork?: string;
}
