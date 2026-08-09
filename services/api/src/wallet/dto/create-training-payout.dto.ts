import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTrainingPayoutDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsNumber()
  @Min(0.00000001)
  tokenAmount!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reference!: string;
}
