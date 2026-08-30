import { IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  planKey!: string;
}
