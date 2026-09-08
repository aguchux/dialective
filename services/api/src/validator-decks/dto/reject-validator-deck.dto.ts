import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectValidatorDeckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
