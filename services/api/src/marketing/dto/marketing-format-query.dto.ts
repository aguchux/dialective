import { IsIn, IsOptional } from 'class-validator';
import { MARKETING_AD_FORMATS, MarketingAdFormat } from './create-marketing-upload-url.dto';

export class MarketingFormatQueryDto {
  @IsOptional()
  @IsIn(MARKETING_AD_FORMATS)
  format?: MarketingAdFormat;
}
