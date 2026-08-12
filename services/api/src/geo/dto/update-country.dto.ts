import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';

export class UpdateCountryDto {
  @IsOptional()
  @IsString()
  @Length(2, 2)
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  llmGenerationEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currencyCode?: string;

  /** Setting this marks exchangeRateSource: 'MANUAL' -- fx-rate-job skips this country until resetExchangeRateToLive is called. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  usdExchangeRate?: number;
}
