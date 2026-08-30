import { IsIn, IsString } from 'class-validator';
import { MARKETING_AD_FORMATS, MarketingAdFormat } from './create-marketing-upload-url.dto';

export class CreateMarketingPhotoDto {
  @IsIn(MARKETING_AD_FORMATS)
  format!: MarketingAdFormat;

  @IsString()
  bucket!: string;

  @IsString()
  key!: string;
}
