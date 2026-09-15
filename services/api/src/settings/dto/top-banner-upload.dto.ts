import { IsIn } from 'class-validator';

export class TopBannerUploadDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
}
