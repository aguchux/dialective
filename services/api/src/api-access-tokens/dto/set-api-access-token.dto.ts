import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetApiAccessTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  value!: string;
}
