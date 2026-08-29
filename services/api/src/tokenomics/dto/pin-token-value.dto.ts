import { IsNumber, IsPositive } from 'class-validator';

export class PinTokenValueDto {
  @IsNumber()
  @IsPositive()
  value!: number;
}
