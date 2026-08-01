import { IsString } from 'class-validator';

export class ConsumeMagicLinkDto {
  @IsString()
  token!: string;
}
