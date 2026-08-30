import { IsIn, IsString, MaxLength } from 'class-validator';
import { MARKETING_AD_FORMATS, MarketingAdFormat } from './create-marketing-upload-url.dto';

export class CreateMarketingHeadlineDto {
  @IsIn(MARKETING_AD_FORMATS)
  format!: MarketingAdFormat;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(400)
  description!: string;
}
