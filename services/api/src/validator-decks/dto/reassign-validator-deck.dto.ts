import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class ReassignValidatorDeckDto {
  @IsString()
  @MinLength(1)
  newOwnerUserId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  penaltyPercent?: number;
}
