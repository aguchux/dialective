import { IsString, MaxLength, MinLength } from 'class-validator';

export class CopyPublicDeckDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  newDeckName!: string;
}
