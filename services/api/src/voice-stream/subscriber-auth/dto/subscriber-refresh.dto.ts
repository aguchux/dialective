import { IsString } from 'class-validator';

export class SubscriberRefreshDto {
  @IsString()
  refreshToken!: string;
}
