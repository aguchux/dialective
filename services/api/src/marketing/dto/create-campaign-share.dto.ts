import { IsString } from 'class-validator';

export class CreateCampaignShareDto {
  @IsString()
  photoId!: string;

  @IsString()
  headlineId!: string;
}
