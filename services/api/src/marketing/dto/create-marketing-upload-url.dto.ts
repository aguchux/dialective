import { IsIn } from 'class-validator';

export const ALLOWED_MARKETING_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type AllowedMarketingImageContentType =
  (typeof ALLOWED_MARKETING_IMAGE_CONTENT_TYPES)[number];

export const MARKETING_AD_FORMATS = ['FEED_SQUARE', 'STORY', 'LINK_PREVIEW'] as const;
export type MarketingAdFormat = (typeof MARKETING_AD_FORMATS)[number];

export class CreateMarketingUploadUrlDto {
  @IsIn(MARKETING_AD_FORMATS)
  format!: MarketingAdFormat;

  @IsIn(ALLOWED_MARKETING_IMAGE_CONTENT_TYPES)
  contentType!: AllowedMarketingImageContentType;
}
